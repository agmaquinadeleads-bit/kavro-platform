begin;

-- Histórico com detalhe do que mudou: até aqui, metadata só guardava
-- {"operation": tg_op}, então a UI não conseguia mostrar o valor antigo x
-- novo. Passa a comparar campo a campo em lead.updated e a gravar o nome
-- das etapas (não o UUID) em lead.stage_changed, como um snapshot de texto
-- — assim o histórico continua correto mesmo se a etapa for renomeada
-- depois. Eventos gravados ANTES desta migration continuam só com
-- {"operation": ...}, não dá pra reconstruir retroativamente.
create or replace function public.audit_lead_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_action text;
  event_org_id uuid;
  event_resource_id uuid;
  event_metadata jsonb;
  changes jsonb := '{}'::jsonb;
  old_stage_name text;
  new_stage_name text;
  old_owner_name text;
  new_owner_name text;
begin
  if tg_op = 'INSERT' then
    event_action := 'lead.created'; event_org_id := new.org_id; event_resource_id := new.id;
  elsif tg_op = 'DELETE' then
    event_action := 'lead.deleted'; event_org_id := old.org_id; event_resource_id := old.id;
  elsif old.deleted_at is null and new.deleted_at is not null then
    event_action := 'lead.archived'; event_org_id := new.org_id; event_resource_id := new.id;
  elsif old.stage_id is distinct from new.stage_id then
    event_action := 'lead.stage_changed'; event_org_id := new.org_id; event_resource_id := new.id;
  else
    event_action := 'lead.updated'; event_org_id := new.org_id; event_resource_id := new.id;
  end if;

  event_metadata := jsonb_build_object('operation', tg_op);

  if event_action = 'lead.stage_changed' then
    select name into old_stage_name from public.pipeline_stages where id = old.stage_id;
    select name into new_stage_name from public.pipeline_stages where id = new.stage_id;
    event_metadata := event_metadata || jsonb_build_object('from_stage', old_stage_name, 'to_stage', new_stage_name);
  elsif event_action = 'lead.updated' then
    if old.name is distinct from new.name then
      changes := changes || jsonb_build_object('name', jsonb_build_object('old', old.name, 'new', new.name));
    end if;
    if old.email is distinct from new.email then
      changes := changes || jsonb_build_object('email', jsonb_build_object('old', old.email, 'new', new.email));
    end if;
    if old.phone is distinct from new.phone then
      changes := changes || jsonb_build_object('phone', jsonb_build_object('old', old.phone, 'new', new.phone));
    end if;
    if old.source is distinct from new.source then
      changes := changes || jsonb_build_object('source', jsonb_build_object('old', old.source, 'new', new.source));
    end if;
    if old.value_in_cents is distinct from new.value_in_cents then
      changes := changes || jsonb_build_object('value_in_cents', jsonb_build_object('old', old.value_in_cents, 'new', new.value_in_cents));
    end if;
    if old.follow_up_at is distinct from new.follow_up_at then
      changes := changes || jsonb_build_object('follow_up_at', jsonb_build_object('old', old.follow_up_at, 'new', new.follow_up_at));
    end if;
    if old.notes is distinct from new.notes then
      -- Notas podem ter até 10.000 caracteres — grava só a flag de que
      -- mudou, não o texto inteiro antes/depois (custo de armazenamento).
      changes := changes || jsonb_build_object('notes', true);
    end if;
    if old.owner_id is distinct from new.owner_id then
      if old.owner_id is not null then
        select full_name into old_owner_name from public.user_profiles where id = old.owner_id;
      end if;
      if new.owner_id is not null then
        select full_name into new_owner_name from public.user_profiles where id = new.owner_id;
      end if;
      changes := changes || jsonb_build_object('owner', jsonb_build_object('old', old_owner_name, 'new', new_owner_name));
    end if;
    event_metadata := event_metadata || jsonb_build_object('changes', changes);
  end if;

  insert into public.audit_events (org_id, actor_id, action, resource_type, resource_id, metadata)
  values (event_org_id, auth.uid(), event_action, 'lead', event_resource_id, event_metadata);
  return coalesce(new, old);
end;
$$;

revoke all on function public.audit_lead_change() from public;

-- Tags: classificação livre do lead (ex: Parceiro, Fornecedor). Algumas
-- tags pré-definidas podem levar o lead pra um funil específico
-- automaticamente (routes_to_pipeline_id) — hoje só Parceiro/Fornecedor
-- usam isso, não é um mecanismo exposto na criação de tags pelo usuário.
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  routes_to_pipeline_id uuid,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, routes_to_pipeline_id) references public.pipelines(org_id, id) on delete set null
);

create unique index tags_org_name_unique on public.tags (org_id, lower(name));

alter table public.tags enable row level security;

create policy tags_select_member
  on public.tags for select
  to authenticated
  using (public.is_org_member(org_id));

-- Criar/editar/apagar tag é ação de admin/owner (mantém a taxonomia
-- limpa); aplicar uma tag JÁ existente num lead é liberado pra qualquer
-- membro (política em lead_tags, abaixo).
create policy tags_write_admin
  on public.tags for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]))
  with check (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]));

revoke all on public.tags from anon, authenticated;
grant select, insert, update, delete on public.tags to authenticated;

create table public.lead_tags (
  org_id uuid not null,
  lead_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (lead_id, tag_id),
  foreign key (org_id, lead_id) references public.leads(org_id, id) on delete cascade,
  foreign key (org_id, tag_id) references public.tags(org_id, id) on delete cascade
);

create index lead_tags_org_lead_idx on public.lead_tags (org_id, lead_id);

alter table public.lead_tags enable row level security;

create policy lead_tags_select_member
  on public.lead_tags for select
  to authenticated
  using (public.is_org_member(org_id));

create policy lead_tags_insert_member
  on public.lead_tags for insert
  to authenticated
  with check (public.is_org_member(org_id));

create policy lead_tags_delete_member
  on public.lead_tags for delete
  to authenticated
  using (public.is_org_member(org_id));

revoke all on public.lead_tags from anon, authenticated;
grant select, insert, delete on public.lead_tags to authenticated;

-- Quando uma tag com routes_to_pipeline_id é aplicada a um lead, ele muda
-- de funil na hora (pipeline_id + stage_id) — não duplica, sai de vez de
-- onde estava (confirmado com o usuário). Só mexe se o lead ainda não
-- estiver nesse pipeline, pra não resetar a etapa numa segunda tag.
create or replace function public.route_lead_by_tag()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target_pipeline_id uuid;
  first_stage public.pipeline_stages;
begin
  select routes_to_pipeline_id into target_pipeline_id
  from public.tags
  where id = new.tag_id and org_id = new.org_id;

  if target_pipeline_id is null then return new; end if;

  select * into first_stage
  from public.pipeline_stages
  where org_id = new.org_id and pipeline_id = target_pipeline_id
  order by position asc
  limit 1;

  if first_stage.id is null then return new; end if;

  update public.leads
  set pipeline_id = target_pipeline_id, stage_id = first_stage.id
  where id = new.lead_id and org_id = new.org_id and pipeline_id is distinct from target_pipeline_id;

  return new;
end;
$$;

revoke all on function public.route_lead_by_tag() from public;

drop trigger if exists lead_tags_route_by_tag on public.lead_tags;
create trigger lead_tags_route_by_tag
  after insert on public.lead_tags
  for each row execute function public.route_lead_by_tag();

-- Toda org nova passa a ganhar também o funil "Parceiros e fornecedores" e
-- as tags Parceiro/Fornecedor (já configuradas pra rotear pra esse funil),
-- junto do Comercial e do Pós-venda.
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
  created_partners_pipeline public.pipelines;
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

  insert into public.pipelines (org_id, name, position)
  values (created_organization.id, 'Parceiros e fornecedores', 2)
  returning * into created_partners_pipeline;

  insert into public.pipeline_stages (org_id, pipeline_id, name, position, is_won, is_lost)
  values (created_organization.id, created_partners_pipeline.id, 'Novos parceiros', 0, false, false);

  insert into public.tags (org_id, name, color, routes_to_pipeline_id)
  values
    (created_organization.id, 'Parceiro', '#2563eb', created_partners_pipeline.id),
    (created_organization.id, 'Fornecedor', '#7c3aed', created_partners_pipeline.id);

  return created_organization;
end;
$$;

revoke all on function public.create_organization(text, text) from public;
grant execute on function public.create_organization(text, text) to authenticated;

-- Backfill: orgs já existentes ganham o funil Parceiros e fornecedores e
-- as tags Parceiro/Fornecedor agora, sem precisar recriar a organização.
do $$
declare
  org_record record;
  next_position integer;
  created_pipeline_id uuid;
begin
  for org_record in select id from public.organizations loop
    if not exists (select 1 from public.tags where org_id = org_record.id and lower(name) = 'parceiro')
       and not exists (select 1 from public.tags where org_id = org_record.id and lower(name) = 'fornecedor') then
      select coalesce(max(position), -1) + 1 into next_position
      from public.pipelines where org_id = org_record.id;

      insert into public.pipelines (org_id, name, position)
      values (org_record.id, 'Parceiros e fornecedores', next_position)
      returning id into created_pipeline_id;

      insert into public.pipeline_stages (org_id, pipeline_id, name, position, is_won, is_lost)
      values (org_record.id, created_pipeline_id, 'Novos parceiros', 0, false, false);

      insert into public.tags (org_id, name, color, routes_to_pipeline_id)
      values
        (org_record.id, 'Parceiro', '#2563eb', created_pipeline_id),
        (org_record.id, 'Fornecedor', '#7c3aed', created_pipeline_id);
    end if;
  end loop;
end;
$$;

commit;
