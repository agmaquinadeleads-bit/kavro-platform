begin;

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null,
  activity_type text not null check (activity_type in ('note', 'call', 'meeting', 'message')),
  content text not null check (char_length(btrim(content)) between 1 and 4000),
  occurred_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, lead_id) references public.leads(org_id, id) on delete cascade
);

create index lead_activities_org_lead_idx
  on public.lead_activities (org_id, lead_id, occurred_at desc, created_at desc);

alter table public.lead_activities enable row level security;

create policy lead_activities_select_member
  on public.lead_activities
  for select
  to authenticated
  using (public.is_org_member(org_id));

create policy lead_activities_insert_member
  on public.lead_activities
  for insert
  to authenticated
  with check (public.is_org_member(org_id) and created_by = auth.uid());

create or replace function public.set_lead_activity_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lead_is_active boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  new.created_by := auth.uid();

  select exists (
    select 1
    from public.leads
    where id = new.lead_id
      and org_id = new.org_id
      and deleted_at is null
  ) into lead_is_active;

  if not lead_is_active then
    raise exception 'Active lead required' using errcode = '23514';
  end if;

  new.content := btrim(new.content);
  return new;
end;
$$;

create or replace function public.audit_lead_activity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_events (
    org_id,
    actor_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    new.org_id,
    auth.uid(),
    'lead_activity.created',
    'lead',
    new.lead_id,
    jsonb_build_object(
      'activity_type', new.activity_type,
      'activity_id', new.id
    )
  );

  return new;
end;
$$;

revoke all on function public.set_lead_activity_metadata() from public;
revoke all on function public.audit_lead_activity_change() from public;

create trigger lead_activities_set_metadata
before insert on public.lead_activities
for each row execute function public.set_lead_activity_metadata();

create trigger lead_activities_audit_change
after insert on public.lead_activities
for each row execute function public.audit_lead_activity_change();

revoke all on public.lead_activities from anon, authenticated;
grant select, insert on public.lead_activities to authenticated;

commit;
