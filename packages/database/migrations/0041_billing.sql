begin;

-- Infraestrutura de billing (Fase A) — hoje o pagamento (Stripe) e o CRM
-- não se falam: organizations não tem nenhuma coluna de plano, então
-- qualquer org paga tem acesso tecnicamente ilimitado. Esta migration só
-- cria as tabelas e a função de cálculo de limite — nenhuma organização
-- existente é afetada (toda org sem vínculo de Stripe fica com limite
-- null = ilimitado, é assim que os clientes reais de hoje continuam
-- funcionando exatamente como antes até serem ligados manualmente ao
-- Stripe depois). O enforcement de verdade (bloquear convite/conexão
-- acima do limite) vem na migration seguinte (0042).

-- Catálogo Kavro do que cada price_id do Stripe libera — os limites NÃO
-- vivem no Stripe (metadado), o Kavro é quem decide. Uma linha por
-- price_id ativo (plano base ou add-on).
create table public.billing_plan_catalog (
  id uuid primary key default gen_random_uuid(),
  stripe_price_id text not null unique check (char_length(stripe_price_id) between 3 and 120),
  stripe_product_id text not null check (char_length(stripe_product_id) between 3 and 120),
  kind text not null check (kind in ('base_plan', 'addon_seat', 'addon_whatsapp_number', 'addon_leads')),
  -- Só preenchido pra kind='base_plan' — identifica o tier pra exibição.
  plan_code text check (plan_code is null or plan_code in ('solo', 'negocio', 'agencia')),
  plan_label text check (plan_label is null or char_length(plan_label) <= 60),
  seats_included integer not null default 0 check (seats_included >= 0),
  leads_included integer not null default 0 check (leads_included >= 0),
  whatsapp_numbers_included integer not null default 0 check (whatsapp_numbers_included >= 0),
  creative_tracking_enabled boolean not null default false,
  priority_support_enabled boolean not null default false,
  -- Quanto UMA unidade desse add-on concede (ex: addon_seat = +1 vendedor
  -- por unidade de quantity comprada). Fica 0 pra kind='base_plan' (os
  -- *_included acima já cobrem o plano inteiro).
  addon_grants_seats integer not null default 0 check (addon_grants_seats >= 0),
  addon_grants_leads integer not null default 0 check (addon_grants_leads >= 0),
  addon_grants_whatsapp_numbers integer not null default 0 check (addon_grants_whatsapp_numbers >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'base_plan' or plan_code is not null),
  check (kind = 'base_plan' or (seats_included = 0 and leads_included = 0 and whatsapp_numbers_included = 0))
);

-- Estado de cobrança por organização — 1:1 com organizations, mas NÃO tem
-- uma linha obrigatória por org (org sem linha aqui = nunca vinculada ao
-- Stripe = sem limite nenhum, tratamento idêntico ao de uma linha com os
-- effective_*_limit nulos). effective_*_limit é um cache calculado por
-- refresh_organization_billing_limits() — a fonte da verdade real é
-- billing_plan_catalog + organization_billing_addons, isso aqui só evita
-- recalcular via join em toda checagem de limite.
create table public.organization_billing (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  stripe_customer_id text unique check (stripe_customer_id is null or char_length(stripe_customer_id) between 3 and 120),
  stripe_subscription_id text unique check (stripe_subscription_id is null or char_length(stripe_subscription_id) between 3 and 120),
  base_plan_price_id text references public.billing_plan_catalog(stripe_price_id),
  subscription_status text not null default 'legacy_unmanaged' check (subscription_status in (
    'legacy_unmanaged', 'trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid'
  )),
  current_period_end timestamptz,
  effective_seats_limit integer,
  effective_leads_limit integer,
  effective_whatsapp_numbers_limit integer,
  effective_creative_tracking_enabled boolean not null default false,
  effective_priority_support_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add-ons comprados, por tipo — quantidade (não linha repetida), espelha
-- como o próprio Stripe representa isso (um subscription item por price,
-- com quantity). org_id + price_id é a chave natural.
create table public.organization_billing_addons (
  org_id uuid not null references public.organizations(id) on delete cascade,
  stripe_price_id text not null references public.billing_plan_catalog(stripe_price_id),
  stripe_subscription_item_id text unique,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (org_id, stripe_price_id)
);

-- Idempotência de webhook — mesmo padrão de whatsapp_webhook_events
-- (0010): Stripe reenvia evento, event.id é a chave de dedupe.
create table public.stripe_webhook_events (
  id bigint generated always as identity primary key,
  stripe_event_id text not null unique check (char_length(stripe_event_id) between 3 and 255),
  event_type text not null check (char_length(event_type) between 2 and 100),
  processing_status text not null default 'pending' check (processing_status in ('pending', 'processed', 'failed', 'discarded')),
  error_code text check (error_code is null or char_length(error_code) <= 120),
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index stripe_webhook_events_pending_idx on public.stripe_webhook_events (processing_status, received_at) where processing_status in ('pending', 'failed');

alter table public.billing_plan_catalog enable row level security;
alter table public.organization_billing enable row level security;
alter table public.organization_billing_addons enable row level security;
alter table public.stripe_webhook_events enable row level security;

create policy billing_plan_catalog_select_authenticated on public.billing_plan_catalog for select to authenticated using (active);
create policy organization_billing_select_member on public.organization_billing for select to authenticated using (public.is_org_member(org_id));
create policy organization_billing_addons_select_member on public.organization_billing_addons for select to authenticated using (public.is_org_member(org_id));
-- stripe_webhook_events: sem policy de select — é interno, só service_role
-- lê/escreve (mesmo tratamento de whatsapp_webhook_events).

revoke all on public.billing_plan_catalog from anon, authenticated;
grant select on public.billing_plan_catalog to authenticated;
revoke all on public.organization_billing from anon, authenticated;
grant select on public.organization_billing to authenticated;
revoke all on public.organization_billing_addons from anon, authenticated;
grant select on public.organization_billing_addons to authenticated;
revoke all on public.stripe_webhook_events from anon, authenticated;

-- Recalcula o snapshot effective_*_limit somando plano base + add-ons —
-- chamado pelo webhook do Stripe depois de qualquer escrita em
-- organization_billing/organization_billing_addons. security definer +
-- grant só pra service_role (só o backend, via webhook, deve chamar isso).
create or replace function public.refresh_organization_billing_limits(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base record;
  addon_seats integer;
  addon_leads integer;
  addon_wa integer;
begin
  select c.seats_included, c.leads_included, c.whatsapp_numbers_included, c.creative_tracking_enabled, c.priority_support_enabled
    into base
    from public.billing_plan_catalog c
    join public.organization_billing b on b.base_plan_price_id = c.stripe_price_id
    where b.org_id = p_org_id;

  select coalesce(sum(a.quantity * c.addon_grants_seats), 0),
         coalesce(sum(a.quantity * c.addon_grants_leads), 0),
         coalesce(sum(a.quantity * c.addon_grants_whatsapp_numbers), 0)
    into addon_seats, addon_leads, addon_wa
    from public.organization_billing_addons a
    join public.billing_plan_catalog c on c.stripe_price_id = a.stripe_price_id
    where a.org_id = p_org_id;

  update public.organization_billing set
    effective_seats_limit = coalesce(base.seats_included, 0) + coalesce(addon_seats, 0),
    effective_leads_limit = coalesce(base.leads_included, 0) + coalesce(addon_leads, 0),
    effective_whatsapp_numbers_limit = coalesce(base.whatsapp_numbers_included, 0) + coalesce(addon_wa, 0),
    effective_creative_tracking_enabled = coalesce(base.creative_tracking_enabled, false),
    effective_priority_support_enabled = coalesce(base.priority_support_enabled, false),
    updated_at = now()
  where org_id = p_org_id;
end;
$$;

revoke all on function public.refresh_organization_billing_limits(uuid) from public, anon, authenticated;
grant execute on function public.refresh_organization_billing_limits(uuid) to service_role;

commit;
