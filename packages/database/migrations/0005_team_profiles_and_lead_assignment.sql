begin;

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (full_name is null or char_length(trim(full_name)) between 1 and 120),
  email text check (email is null or char_length(email) <= 254),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.user_profiles (id, full_name, email)
select id, nullif(trim(raw_user_meta_data ->> 'full_name'), ''), email
from auth.users
on conflict (id) do update set full_name = excluded.full_name, email = excluded.email, updated_at = now();

alter table public.organization_members
  add constraint organization_members_user_profile_fkey
  foreign key (user_id) references public.user_profiles(id) on delete cascade;

alter table public.organization_members
  add constraint organization_members_single_org_user unique (user_id);

create or replace function public.sync_user_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.user_profiles (id, full_name, email)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), new.email)
  on conflict (id) do update set full_name = excluded.full_name, email = excluded.email, updated_at = now();
  return new;
end;
$$;

create trigger auth_users_sync_profile after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.sync_user_profile();

create or replace function public.shares_org_with(target_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members mine
    join public.organization_members theirs on theirs.org_id = mine.org_id
    where mine.user_id = auth.uid() and theirs.user_id = target_user_id
  );
$$;

revoke all on function public.sync_user_profile() from public;
revoke all on function public.shares_org_with(uuid) from public;
grant execute on function public.shares_org_with(uuid) to authenticated;

alter table public.user_profiles enable row level security;
create policy user_profiles_select_teammate on public.user_profiles for select to authenticated
using (id = auth.uid() or public.shares_org_with(id));
create policy user_profiles_update_self on public.user_profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.guard_lead_integrity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.version := 1;
    new.deleted_at := null;
    if new.owner_id is not null
      and new.owner_id is distinct from auth.uid()
      and not public.has_org_role(new.org_id, array['owner', 'admin']::public.organization_role[]) then
      raise exception 'Members can only assign new leads to themselves' using errcode = '42501';
    end if;
    return new;
  end if;
  new.org_id := old.org_id; new.created_by := old.created_by;
  if new.owner_id is distinct from old.owner_id
    and not public.has_org_role(old.org_id, array['owner', 'admin']::public.organization_role[])
    and new.owner_id is distinct from auth.uid() then
    raise exception 'Only administrators can assign leads to other users' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_lead_integrity() from public;
create trigger leads_guard_integrity before insert or update on public.leads
for each row execute function public.guard_lead_integrity();

drop policy lead_tasks_select_member on public.lead_tasks;
create policy lead_tasks_select_member on public.lead_tasks for select to authenticated
using (
  public.is_org_member(org_id)
  and (
    public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[])
    or assigned_to = auth.uid()
    or created_by = auth.uid()
  )
);

drop policy lead_tasks_update_member on public.lead_tasks;
create policy lead_tasks_update_member on public.lead_tasks for update to authenticated
using (
  public.is_org_member(org_id)
  and (
    public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[])
    or assigned_to = auth.uid()
  )
) with check (
  public.is_org_member(org_id)
  and (
    public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[])
    or assigned_to = auth.uid()
  )
);

create or replace function public.set_lead_task_metadata()
returns trigger language plpgsql security definer set search_path = '' as $$
declare lead_is_active boolean;
begin
  select exists (select 1 from public.leads where id = new.lead_id and org_id = new.org_id and deleted_at is null) into lead_is_active;
  if not lead_is_active then raise exception 'Active lead required' using errcode = '23514'; end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid(); new.completed_at := null; new.version := 1;
  else
    new.org_id := old.org_id; new.lead_id := old.lead_id; new.created_by := old.created_by;
    if new.assigned_to is distinct from old.assigned_to and not public.has_org_role(old.org_id, array['owner', 'admin']::public.organization_role[]) then
      raise exception 'Only administrators can reassign tasks' using errcode = '42501';
    end if;
    if new.completed_at is distinct from old.completed_at then
      new.completed_at := case when new.completed_at is null then null else now() end;
    end if;
  end if;
  new.title := trim(new.title); new.description := nullif(trim(new.description), ''); new.updated_at := now();
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  return new;
end;
$$;

revoke all on public.user_profiles from anon, authenticated;
grant select, update on public.user_profiles to authenticated;

commit;
