begin;

create extension if not exists pgcrypto;

create type public.organization_role as enum ('owner', 'admin', 'member');
create type public.lead_status as enum ('open', 'won', 'lost');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index organization_members_user_idx
  on public.organization_members (user_id, org_id);

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members membership
    where membership.org_id = target_org_id
      and membership.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(
  target_org_id uuid,
  allowed_roles public.organization_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members membership
    where membership.org_id = target_org_id
      and membership.user_id = auth.uid()
      and membership.role = any(allowed_roles)
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.has_org_role(uuid, public.organization_role[]) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.organization_role[]) to authenticated;

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
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  insert into public.organizations (name, slug)
  values (trim(organization_name), lower(trim(organization_slug)))
  returning * into created_organization;

  insert into public.organization_members (org_id, user_id, role)
  values (created_organization.id, current_user_id, 'owner');

  return created_organization;
end;
$$;

revoke all on function public.create_organization(text, text) from public;
grant execute on function public.create_organization(text, text) to authenticated;

create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, position)
);

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  pipeline_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 100),
  position integer not null check (position >= 0),
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, pipeline_id, position),
  foreign key (org_id, pipeline_id)
    references public.pipelines(org_id, id)
    on delete cascade,
  check (not (is_won and is_lost))
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  pipeline_id uuid not null,
  stage_id uuid not null,
  owner_id uuid,
  created_by uuid not null references auth.users(id),
  name text not null check (char_length(trim(name)) between 1 and 160),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 32),
  source text check (source is null or char_length(source) <= 120),
  notes text check (notes is null or char_length(notes) <= 10000),
  status public.lead_status not null default 'open',
  value_in_cents bigint not null default 0 check (value_in_cents >= 0),
  follow_up_at timestamptz,
  loss_reason text check (loss_reason is null or char_length(loss_reason) <= 160),
  version integer not null default 1 check (version > 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, pipeline_id)
    references public.pipelines(org_id, id),
  foreign key (org_id, stage_id)
    references public.pipeline_stages(org_id, id),
  foreign key (org_id, owner_id)
    references public.organization_members(org_id, user_id),
  check (
    (status = 'lost' and loss_reason is not null)
    or (status <> 'lost' and loss_reason is null)
  )
);

create index leads_org_pipeline_stage_idx
  on public.leads (org_id, pipeline_id, stage_id, created_at desc)
  where deleted_at is null;

create index leads_org_owner_idx
  on public.leads (org_id, owner_id, created_at desc)
  where deleted_at is null;

create index leads_org_follow_up_idx
  on public.leads (org_id, follow_up_at)
  where deleted_at is null and follow_up_at is not null;

create table public.audit_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id),
  actor_id uuid references auth.users(id),
  action text not null check (char_length(action) between 3 and 100),
  resource_type text not null check (char_length(resource_type) between 2 and 100),
  resource_id uuid,
  request_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_org_created_idx
  on public.audit_events (org_id, created_at desc);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.leads enable row level security;
alter table public.audit_events enable row level security;

create policy organizations_select_member
  on public.organizations for select
  to authenticated
  using (public.is_org_member(id));

create policy organizations_update_admin
  on public.organizations for update
  to authenticated
  using (public.has_org_role(id, array['owner', 'admin']::public.organization_role[]))
  with check (public.has_org_role(id, array['owner', 'admin']::public.organization_role[]));

create policy organization_members_select_member
  on public.organization_members for select
  to authenticated
  using (public.is_org_member(org_id));

create policy organization_members_insert_admin
  on public.organization_members for insert
  to authenticated
  with check (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]));

create policy organization_members_update_admin
  on public.organization_members for update
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]))
  with check (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]));

create policy organization_members_delete_admin
  on public.organization_members for delete
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]));

create policy pipelines_select_member
  on public.pipelines for select
  to authenticated
  using (public.is_org_member(org_id));

create policy pipelines_write_admin
  on public.pipelines for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]))
  with check (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]));

create policy pipeline_stages_select_member
  on public.pipeline_stages for select
  to authenticated
  using (public.is_org_member(org_id));

create policy pipeline_stages_write_admin
  on public.pipeline_stages for all
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]))
  with check (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]));

create policy leads_select_member
  on public.leads for select
  to authenticated
  using (public.is_org_member(org_id));

create policy leads_insert_member
  on public.leads for insert
  to authenticated
  with check (
    public.is_org_member(org_id)
    and created_by = auth.uid()
  );

create policy leads_update_member
  on public.leads for update
  to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

create policy leads_delete_admin
  on public.leads for delete
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]));

create policy audit_events_select_admin
  on public.audit_events for select
  to authenticated
  using (public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[]));

revoke all on public.organizations from anon, authenticated;
revoke all on public.organization_members from anon, authenticated;
revoke all on public.pipelines from anon, authenticated;
revoke all on public.pipeline_stages from anon, authenticated;
revoke all on public.leads from anon, authenticated;
revoke all on public.audit_events from anon, authenticated;

grant select, update on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;
grant select, insert, update, delete on public.pipelines to authenticated;
grant select, insert, update, delete on public.pipeline_stages to authenticated;
grant select, insert, update, delete on public.leads to authenticated;
grant select on public.audit_events to authenticated;

revoke insert, update, delete on public.audit_events from authenticated;

commit;
