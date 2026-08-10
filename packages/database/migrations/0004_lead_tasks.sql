begin;

create table public.lead_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null,
  title text not null check (char_length(trim(title)) between 1 and 160),
  description text check (description is null or char_length(description) <= 2000),
  due_at timestamptz,
  assigned_to uuid,
  created_by uuid not null references auth.users(id),
  completed_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, lead_id) references public.leads(org_id, id) on delete cascade,
  foreign key (org_id, assigned_to) references public.organization_members(org_id, user_id)
);

create index lead_tasks_org_lead_idx on public.lead_tasks (org_id, lead_id, completed_at, due_at);
create index lead_tasks_org_assignee_idx on public.lead_tasks (org_id, assigned_to, completed_at, due_at);

alter table public.lead_tasks enable row level security;

create policy lead_tasks_select_member on public.lead_tasks for select to authenticated
using (public.is_org_member(org_id));

create policy lead_tasks_insert_member on public.lead_tasks for insert to authenticated
with check (
  public.is_org_member(org_id)
  and created_by = auth.uid()
  and (
    public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[])
    or assigned_to is null
    or assigned_to = auth.uid()
  )
);

create policy lead_tasks_update_member on public.lead_tasks for update to authenticated
using (
  public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[])
  or created_by = auth.uid()
  or assigned_to = auth.uid()
) with check (
  public.has_org_role(org_id, array['owner', 'admin']::public.organization_role[])
  or created_by = auth.uid()
  or assigned_to = auth.uid()
);

create or replace function public.set_lead_task_metadata()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  lead_is_active boolean;
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.completed_at := null;
    new.version := 1;
    select exists (
      select 1 from public.leads
      where id = new.lead_id and org_id = new.org_id and deleted_at is null
    ) into lead_is_active;
    if not lead_is_active then
      raise exception 'Active lead required' using errcode = '23514';
    end if;
  else
    new.org_id := old.org_id;
    new.lead_id := old.lead_id;
    new.created_by := old.created_by;
    if new.assigned_to is distinct from old.assigned_to
      and not public.has_org_role(old.org_id, array['owner', 'admin']::public.organization_role[]) then
      raise exception 'Only administrators can reassign tasks' using errcode = '42501';
    end if;
  end if;
  new.title := trim(new.title);
  new.description := nullif(trim(new.description), '');
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  return new;
end;
$$;

create or replace function public.audit_lead_task_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare event_action text;
begin
  event_action := case
    when tg_op = 'INSERT' then 'lead_task.created'
    when old.completed_at is null and new.completed_at is not null then 'lead_task.completed'
    when old.completed_at is not null and new.completed_at is null then 'lead_task.reopened'
    else 'lead_task.updated'
  end;
  insert into public.audit_events (org_id, actor_id, action, resource_type, resource_id, metadata)
  values (new.org_id, auth.uid(), event_action, 'lead', new.lead_id,
    jsonb_build_object('task_id', new.id, 'title', new.title));
  return new;
end;
$$;

revoke all on function public.set_lead_task_metadata() from public;
revoke all on function public.audit_lead_task_change() from public;

create trigger lead_tasks_set_metadata before insert or update on public.lead_tasks
for each row execute function public.set_lead_task_metadata();

create trigger lead_tasks_audit after insert or update on public.lead_tasks
for each row execute function public.audit_lead_task_change();

revoke all on public.lead_tasks from anon, authenticated;
grant select, insert, update on public.lead_tasks to authenticated;

commit;
