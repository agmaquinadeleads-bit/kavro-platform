begin;

-- Módulo de Conteúdo/Editorial: linha editorial gerada por IA, aprovação,
-- geração de imagem por IA e publicação automática no Instagram/Facebook.
--
-- Tudo aqui é escopado por brand_id (não direto por org_id) — uma org
-- (agência) pode ter várias marcas/clientes, cada uma com sua própria
-- linha editorial e conexões sociais. Isso é o que permite, no futuro,
-- vender isso como módulo separado e eventualmente dar login a um cliente
-- final escopado a uma única marca — mas essa segunda parte (portal do
-- cliente) não está incluída aqui: o modelo de auth do Kavro hoje trava 1
-- usuário = 1 organização (unique constraint em organization_members),
-- então "cliente loga e vê só a marca dele" é um projeto de auth à parte.

create or replace function public.touch_content_updated_at()
returns trigger language plpgsql security definer set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;

revoke all on function public.touch_content_updated_at() from public;

-- ---------------------------------------------------------------------
-- Marcas
-- ---------------------------------------------------------------------

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id)
);

create trigger brands_touch before update on public.brands
  for each row execute function public.touch_content_updated_at();

alter table public.brands enable row level security;

create policy brands_select_member on public.brands for select
  to authenticated using (public.is_org_member(org_id));

create policy brands_write_admin on public.brands for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]))
  with check (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]));

revoke all on public.brands from anon, authenticated;
grant select, insert, update, delete on public.brands to authenticated;

-- ---------------------------------------------------------------------
-- Conexões sociais (Instagram / Facebook) por marca
-- ---------------------------------------------------------------------

create table public.social_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null,
  provider text not null check (provider in ('instagram', 'facebook')),
  external_account_id text not null check (char_length(external_account_id) between 1 and 160),
  external_account_name text check (external_account_name is null or char_length(external_account_name) <= 160),
  status text not null default 'disconnected' check (status in ('disconnected', 'connected', 'error')),
  connected_by uuid references auth.users(id),
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (brand_id, provider, external_account_id),
  foreign key (org_id, brand_id) references public.brands(org_id, id) on delete cascade
);

create trigger social_connections_touch before update on public.social_connections
  for each row execute function public.touch_content_updated_at();

alter table public.social_connections enable row level security;

create policy social_connections_select_member on public.social_connections for select
  to authenticated using (public.is_org_member(org_id));

create policy social_connections_write_admin on public.social_connections for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]))
  with check (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]));

revoke all on public.social_connections from anon, authenticated;
grant select, insert, update, delete on public.social_connections to authenticated;

-- ---------------------------------------------------------------------
-- Credenciais (token nunca em texto puro — mesmo padrão de
-- whatsapp_provider_credentials / 0013_meta_embedded_signup_vault.sql:
-- secret_reference aponta pro Supabase Vault, gravado só via RPC
-- security definer, sem grant de escrita direta pro client).
-- ---------------------------------------------------------------------

create table public.social_credentials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null,
  secret_reference text not null check (char_length(secret_reference) between 8 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id),
  foreign key (org_id, connection_id) references public.social_connections(org_id, id) on delete cascade
);

comment on column public.social_credentials.secret_reference is
  'Opaque reference to a secret manager entry. Never store a Meta access token in this table.';

create trigger social_credentials_touch before update on public.social_credentials
  for each row execute function public.touch_content_updated_at();

alter table public.social_credentials enable row level security;
revoke all on public.social_credentials from anon, authenticated;

create or replace function public.complete_social_connection(
  p_org_id uuid,
  p_user_id uuid,
  p_brand_id uuid,
  p_provider text,
  p_external_account_id text,
  p_external_account_name text,
  p_access_token text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_connection_id uuid;
  created_secret_id uuid;
begin
  if not exists (
    select 1 from public.organization_members
    where org_id = p_org_id and user_id = p_user_id and role in ('owner', 'admin')
  ) then
    raise exception 'Manager membership required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.brands where id = p_brand_id and org_id = p_org_id) then
    raise exception 'Invalid brand' using errcode = '23503';
  end if;

  if p_provider not in ('instagram', 'facebook') then
    raise exception 'Invalid provider' using errcode = '22023';
  end if;

  if nullif(trim(p_access_token), '') is null then
    raise exception 'Access token required' using errcode = '22023';
  end if;

  select vault.create_secret(
    p_access_token,
    'kavro-social-' || p_provider || '-' || gen_random_uuid()::text,
    'Meta ' || p_provider || ' token managed by the Kavro API'
  ) into created_secret_id;

  insert into public.social_connections (
    org_id, brand_id, provider, external_account_id, external_account_name,
    status, connected_by, connected_at
  ) values (
    p_org_id, p_brand_id, p_provider, p_external_account_id,
    left(nullif(trim(p_external_account_name), ''), 160),
    'connected', p_user_id, now()
  )
  on conflict (brand_id, provider, external_account_id)
  do update set status = 'connected', connected_by = p_user_id, connected_at = now(), updated_at = now()
  returning id into created_connection_id;

  insert into public.social_credentials (org_id, connection_id, secret_reference)
  values (p_org_id, created_connection_id, 'vault:' || created_secret_id::text)
  on conflict (connection_id)
  do update set secret_reference = excluded.secret_reference, updated_at = now();

  return created_connection_id;
end;
$$;

revoke all on function public.complete_social_connection(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_social_connection(uuid, uuid, uuid, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------
-- Linha editorial (briefing + pauta gerada por IA)
-- ---------------------------------------------------------------------

create table public.editorial_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 160),
  theme text check (theme is null or char_length(theme) <= 4000),
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'archived')),
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, brand_id) references public.brands(org_id, id) on delete cascade
);

create trigger editorial_lines_touch before update on public.editorial_lines
  for each row execute function public.touch_content_updated_at();

alter table public.editorial_lines enable row level security;

create policy editorial_lines_select_member on public.editorial_lines for select
  to authenticated using (public.is_org_member(org_id));

create policy editorial_lines_insert_member on public.editorial_lines for insert
  to authenticated with check (public.is_org_member(org_id));

create policy editorial_lines_update_member on public.editorial_lines for update
  to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

create policy editorial_lines_delete_admin on public.editorial_lines for delete
  to authenticated using (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]));

revoke all on public.editorial_lines from anon, authenticated;
grant select, insert, update, delete on public.editorial_lines to authenticated;

-- ---------------------------------------------------------------------
-- Posts de conteúdo (nascem como rascunho junto da linha; a imagem só é
-- gerada depois que a linha é aprovada, pra não gastar com IA de posts
-- que nunca vão sair).
-- ---------------------------------------------------------------------

create table public.content_posts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null,
  editorial_line_id uuid,
  caption text check (caption is null or char_length(caption) <= 4000),
  image_url text check (image_url is null or char_length(image_url) <= 2000),
  ai_image_prompt text check (ai_image_prompt is null or char_length(ai_image_prompt) <= 2000),
  target_providers text[] not null default '{}'
    check (target_providers <@ array['instagram', 'facebook']::text[]),
  status text not null default 'draft' check (
    status in ('draft', 'pending_approval', 'approved', 'scheduled', 'publishing', 'published', 'failed')
  ),
  scheduled_at timestamptz,
  published_at timestamptz,
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, brand_id) references public.brands(org_id, id) on delete cascade,
  foreign key (org_id, editorial_line_id) references public.editorial_lines(org_id, id) on delete set null,
  check (status <> 'scheduled' or scheduled_at is not null)
);

create index content_posts_org_brand_idx on public.content_posts (org_id, brand_id, created_at desc);

create trigger content_posts_touch before update on public.content_posts
  for each row execute function public.touch_content_updated_at();

alter table public.content_posts enable row level security;

create policy content_posts_select_member on public.content_posts for select
  to authenticated using (public.is_org_member(org_id));

create policy content_posts_insert_member on public.content_posts for insert
  to authenticated with check (public.is_org_member(org_id));

create policy content_posts_update_member on public.content_posts for update
  to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

create policy content_posts_delete_admin on public.content_posts for delete
  to authenticated using (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]));

revoke all on public.content_posts from anon, authenticated;
grant select, insert, update, delete on public.content_posts to authenticated;

-- Aprovar linha editorial ou post exige owner/admin — mesmo espírito da
-- dupla checagem (app + trigger) já usada em won_product/loss_reason.
create or replace function public.guard_content_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    if not exists (
      select 1 from public.organization_members
      where org_id = new.org_id and user_id = auth.uid() and role in ('owner', 'admin')
    ) then
      raise exception 'Only owner/admin can approve content' using errcode = '42501';
    end if;
    new.approved_by := auth.uid();
    new.approved_at := now();
  end if;
  return new;
end;
$$;

revoke all on function public.guard_content_approval() from public;

create trigger editorial_lines_guard_approval before insert or update on public.editorial_lines
  for each row execute function public.guard_content_approval();

create trigger content_posts_guard_approval before insert or update on public.content_posts
  for each row execute function public.guard_content_approval();

-- ---------------------------------------------------------------------
-- Fila de publicação — mesmo desenho do whatsapp_outbox (lease/retry),
-- mas com um worker de verdade (apps/api, @nestjs/schedule).
-- ---------------------------------------------------------------------

create table public.content_publish_outbox (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  content_post_id uuid not null,
  provider text not null check (provider in ('instagram', 'facebook')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'dead_letter')),
  attempts integer not null default 0 check (attempts between 0 and 100),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 100),
  last_error_message text check (last_error_message is null or char_length(last_error_message) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, content_post_id) references public.content_posts(org_id, id) on delete cascade
);

create index content_publish_outbox_ready_idx
  on public.content_publish_outbox (next_attempt_at, id)
  where status in ('pending', 'failed');

create trigger content_publish_outbox_touch before update on public.content_publish_outbox
  for each row execute function public.touch_content_updated_at();

alter table public.content_publish_outbox enable row level security;

create policy content_publish_outbox_select_member on public.content_publish_outbox for select
  to authenticated using (public.is_org_member(org_id));

-- Só o trigger (abaixo) e o worker (service_role) gravam aqui — sem
-- grant de insert/update/delete pro client, mesmo padrão de audit_events.
revoke all on public.content_publish_outbox from anon, authenticated;
grant select on public.content_publish_outbox to authenticated;

-- Quando um post vira "scheduled", enfileira um item por rede-alvo.
create or replace function public.enqueue_content_publish()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target_provider text;
begin
  if new.status <> 'scheduled' or (tg_op = 'UPDATE' and old.status = 'scheduled') then return new; end if;
  if new.scheduled_at is null then return new; end if;

  foreach target_provider in array new.target_providers loop
    insert into public.content_publish_outbox (org_id, content_post_id, provider, next_attempt_at)
    values (new.org_id, new.id, target_provider, new.scheduled_at);
  end loop;

  return new;
end;
$$;

revoke all on function public.enqueue_content_publish() from public;

create trigger content_posts_enqueue_publish after insert or update on public.content_posts
  for each row execute function public.enqueue_content_publish();

-- ---------------------------------------------------------------------
-- Log de chamadas de IA (custo/visibilidade — billing ainda não existe).
-- ---------------------------------------------------------------------

create table public.ai_generation_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid,
  kind text not null check (kind in ('text', 'image')),
  provider text not null check (char_length(provider) between 1 and 60),
  requested_by uuid not null references auth.users(id),
  cost_estimate_cents integer check (cost_estimate_cents is null or cost_estimate_cents >= 0),
  created_at timestamptz not null default now(),
  foreign key (org_id, brand_id) references public.brands(org_id, id) on delete set null
);

create index ai_generation_events_org_created_idx on public.ai_generation_events (org_id, created_at desc);

alter table public.ai_generation_events enable row level security;

create policy ai_generation_events_select_member on public.ai_generation_events for select
  to authenticated using (public.is_org_member(org_id));

create policy ai_generation_events_insert_member on public.ai_generation_events for insert
  to authenticated with check (public.is_org_member(org_id) and requested_by = auth.uid());

revoke all on public.ai_generation_events from anon, authenticated;
grant select, insert on public.ai_generation_events to authenticated;

commit;
