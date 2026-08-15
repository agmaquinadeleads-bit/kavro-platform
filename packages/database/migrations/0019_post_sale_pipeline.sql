begin;

-- Identifica de forma confiável qual funil é "o" pós-venda da org, mesmo se
-- for renomeado depois (não podemos confiar em match por nome).
alter table public.pipelines add column is_post_sale boolean not null default false;

create unique index pipelines_org_post_sale_unique
  on public.pipelines (org_id)
  where is_post_sale;

-- Produto vendido, capturado no momento em que o lead vira Ganho — mesma
-- lógica de loss_reason (exigido pelo trigger de escrita quando a etapa é a
-- correspondente, limpo quando sai dela).
alter table public.leads add column won_product text
  check (won_product is null or char_length(trim(won_product)) between 1 and 160);

-- Backfill: leads já ganhos recebem um placeholder antes de tornar o campo
-- obrigatório — sem isso, qualquer edição futura de um lead antigo já
-- fechado (ex.: editar notas) quebraria ao passar pelo trigger de escrita.
update public.leads set won_product = 'Não informado' where status = 'won' and won_product is null;

create or replace function public.set_lead_write_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_stage public.pipeline_stages;
begin
  select * into target_stage
  from public.pipeline_stages
  where id = new.stage_id and org_id = new.org_id and pipeline_id = new.pipeline_id;

  if target_stage.id is null then
    raise exception 'Invalid pipeline stage' using errcode = '23503';
  end if;

  if target_stage.is_lost and nullif(trim(new.loss_reason), '') is null then
    raise exception 'Loss reason is required' using errcode = '23514';
  end if;

  if target_stage.is_won and nullif(trim(new.won_product), '') is null then
    raise exception 'Product is required' using errcode = '23514';
  end if;

  new.status := case
    when target_stage.is_won then 'won'::public.lead_status
    when target_stage.is_lost then 'lost'::public.lead_status
    else 'open'::public.lead_status
  end;
  new.loss_reason := case when target_stage.is_lost then trim(new.loss_reason) else null end;
  new.won_product := case when target_stage.is_won then trim(new.won_product) else null end;
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  return new;
end;
$$;

revoke all on function public.set_lead_write_metadata() from public;

-- Histórico de compras: uma linha por venda. customer_lead_id aponta pro
-- card do cliente no funil pós-venda; source_lead_id aponta pro lead do
-- funil de vendas que gerou essa venda (útil pra auditoria/rastreio).
create table public.customer_purchases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_lead_id uuid not null,
  source_lead_id uuid not null,
  product text not null check (char_length(trim(product)) between 1 and 160),
  value_in_cents bigint not null default 0 check (value_in_cents >= 0),
  purchased_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, customer_lead_id) references public.leads(org_id, id) on delete cascade,
  foreign key (org_id, source_lead_id) references public.leads(org_id, id) on delete cascade
);

create index customer_purchases_org_customer_idx
  on public.customer_purchases (org_id, customer_lead_id, purchased_at desc);

alter table public.customer_purchases enable row level security;

create policy customer_purchases_select_member
  on public.customer_purchases for select
  to authenticated
  using (public.is_org_member(org_id));

-- Só o trigger (security definer, dono da tabela) grava aqui — mesmo padrão
-- de audit_events/conversion_events, sem grant de insert pro client.
revoke all on public.customer_purchases from anon, authenticated;
grant select on public.customer_purchases to authenticated;

-- Reage a "lead virou Ganho" pra manter o card do cliente no pós-venda em
-- dia — mesmo padrão do enqueue_won_lead_conversion (0011), incluindo o
-- guard "new.status <> 'won' or old.status = 'won'" pra disparar só na
-- transição. Roda na mesma transação da mudança de etapa (atômico).
create or replace function public.sync_post_sale_customer()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target_pipeline public.pipelines;
  first_stage public.pipeline_stages;
  customer_lead public.leads;
  normalized_phone text;
begin
  if new.status <> 'won' or old.status = 'won' then return new; end if;

  select * into target_pipeline
  from public.pipelines
  where org_id = new.org_id and is_post_sale
  limit 1;

  -- Sem funil de pós-venda configurado nessa org, não há onde registrar.
  if target_pipeline.id is null then return new; end if;

  -- Evita reprocessar quando o próprio card do cliente (já no pós-venda) é
  -- movido para uma etapa de Ganho manualmente.
  if new.pipeline_id = target_pipeline.id then return new; end if;

  normalized_phone := nullif(regexp_replace(coalesce(new.phone, ''), '[^0-9]', '', 'g'), '');

  if normalized_phone is not null then
    select * into customer_lead
    from public.leads
    where org_id = new.org_id
      and pipeline_id = target_pipeline.id
      and deleted_at is null
      and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = normalized_phone
    order by created_at asc
    limit 1;
  end if;

  if customer_lead.id is null and new.email is not null then
    select * into customer_lead
    from public.leads
    where org_id = new.org_id
      and pipeline_id = target_pipeline.id
      and deleted_at is null
      and lower(email) = lower(new.email)
    order by created_at asc
    limit 1;
  end if;

  if customer_lead.id is null then
    select * into first_stage
    from public.pipeline_stages
    where org_id = target_pipeline.org_id and pipeline_id = target_pipeline.id
    order by position asc
    limit 1;

    -- Funil pós-venda sem nenhuma etapa configurada — não há onde criar o card.
    if first_stage.id is null then return new; end if;

    insert into public.leads (
      org_id, pipeline_id, stage_id, owner_id, created_by, name, email, phone, source, value_in_cents
    ) values (
      new.org_id, target_pipeline.id, first_stage.id, new.owner_id, new.created_by, new.name, new.email, new.phone, new.source, new.value_in_cents
    )
    returning * into customer_lead;
  else
    update public.leads
    set value_in_cents = value_in_cents + new.value_in_cents
    where id = customer_lead.id and org_id = new.org_id;
  end if;

  insert into public.customer_purchases (
    org_id, customer_lead_id, source_lead_id, product, value_in_cents, purchased_at
  ) values (
    new.org_id, customer_lead.id, new.id, coalesce(nullif(trim(new.won_product), ''), 'Não informado'), new.value_in_cents, now()
  );

  return new;
end;
$$;

revoke all on function public.sync_post_sale_customer() from public;

drop trigger if exists leads_sync_post_sale_customer on public.leads;
create trigger leads_sync_post_sale_customer
  after update on public.leads
  for each row execute function public.sync_post_sale_customer();

-- Toda org nova passa a ganhar também o funil Pós-venda, junto do Comercial.
create or replace function public.create_organization(
  organization_name text,
  organization_slug text
)
returns public.organizations
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_organization public.organizations;
  created_pipeline public.pipelines;
  created_post_sale_pipeline public.pipelines;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.organization_members membership
    where membership.user_id = current_user_id
  ) then
    raise exception 'User already belongs to an organization' using errcode = '23505';
  end if;

  insert into public.organizations (name, slug)
  values (trim(organization_name), lower(trim(organization_slug)))
  returning * into created_organization;

  insert into public.organization_members (org_id, user_id, role)
  values (created_organization.id, current_user_id, 'owner');

  insert into public.pipelines (org_id, name, position)
  values (created_organization.id, 'Comercial', 0)
  returning * into created_pipeline;

  insert into public.pipeline_stages (
    org_id,
    pipeline_id,
    name,
    position,
    is_won,
    is_lost
  )
  values
    (created_organization.id, created_pipeline.id, 'Novos leads', 0, false, false),
    (created_organization.id, created_pipeline.id, 'Contato realizado', 1, false, false),
    (created_organization.id, created_pipeline.id, 'Proposta', 2, false, false),
    (created_organization.id, created_pipeline.id, 'Fechado', 3, true, false),
    (created_organization.id, created_pipeline.id, 'Perdido', 4, false, true);

  insert into public.pipelines (org_id, name, position, is_post_sale)
  values (created_organization.id, 'Pós-venda', 1, true)
  returning * into created_post_sale_pipeline;

  insert into public.pipeline_stages (org_id, pipeline_id, name, position, is_won, is_lost)
  values (created_organization.id, created_post_sale_pipeline.id, 'Novos clientes', 0, false, false);

  return created_organization;
end;
$$;

revoke all on function public.create_organization(text, text) from public;
grant execute on function public.create_organization(text, text) to authenticated;

-- Backfill: orgs já existentes ganham o funil Pós-venda agora, sem precisar
-- recriar a organização.
do $$
declare
  org_record record;
  next_position integer;
  created_pipeline_id uuid;
begin
  for org_record in select id from public.organizations loop
    if not exists (select 1 from public.pipelines where org_id = org_record.id and is_post_sale) then
      select coalesce(max(position), -1) + 1 into next_position
      from public.pipelines where org_id = org_record.id;

      insert into public.pipelines (org_id, name, position, is_post_sale)
      values (org_record.id, 'Pós-venda', next_position, true)
      returning id into created_pipeline_id;

      insert into public.pipeline_stages (org_id, pipeline_id, name, position, is_won, is_lost)
      values (org_record.id, created_pipeline_id, 'Novos clientes', 0, false, false);
    end if;
  end loop;
end;
$$;

commit;
