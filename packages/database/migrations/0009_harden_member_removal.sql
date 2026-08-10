begin;

create index if not exists leads_org_any_owner_idx on public.leads (org_id, owner_id) where owner_id is not null;

create or replace function public.set_lead_task_metadata()
returns trigger language plpgsql security definer set search_path = '' as $$
declare lead_is_active boolean; pure_administrative_reassignment boolean := false;
begin
  if tg_op = 'UPDATE' then
    new.org_id := old.org_id; new.lead_id := old.lead_id; new.created_by := old.created_by;
    select exists (select 1 from public.leads where id = old.lead_id and org_id = old.org_id and deleted_at is null) into lead_is_active;
    pure_administrative_reassignment := new.assigned_to is distinct from old.assigned_to
      and new.title is not distinct from old.title
      and new.description is not distinct from old.description
      and new.due_at is not distinct from old.due_at
      and new.completed_at is not distinct from old.completed_at
      and new.version is not distinct from old.version
      and public.has_org_role(old.org_id, array['owner', 'admin']::public.organization_role[]);
    if not lead_is_active and not pure_administrative_reassignment then raise exception 'Active lead required' using errcode = '23514'; end if;
    if new.assigned_to is distinct from old.assigned_to and not public.has_org_role(old.org_id, array['owner', 'admin']::public.organization_role[]) then raise exception 'Only administrators can reassign tasks' using errcode = '42501'; end if;
    if new.completed_at is distinct from old.completed_at then new.completed_at := case when new.completed_at is null then null else now() end; end if;
  else
    select exists (select 1 from public.leads where id = new.lead_id and org_id = new.org_id and deleted_at is null) into lead_is_active;
    if not lead_is_active then raise exception 'Active lead required' using errcode = '23514'; end if;
    new.created_by := auth.uid(); new.completed_at := null; new.version := 1;
  end if;
  new.title := trim(new.title); new.description := nullif(trim(new.description), ''); new.updated_at := now();
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  return new;
end;
$$;

create or replace function public.remove_org_member(target_user_id uuid, replacement_user_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target_org_id uuid; actor_role public.organization_role; target_role public.organization_role; lead_count integer; task_count integer;
begin
  select org_id into target_org_id from public.organization_members where user_id = auth.uid();
  if target_org_id is null then raise exception 'Administrator required' using errcode = '42501'; end if;
  perform 1 from public.organizations where id = target_org_id for update;
  select role into actor_role from public.organization_members where org_id = target_org_id and user_id = auth.uid() for update;
  if actor_role is null or actor_role not in ('owner', 'admin') then raise exception 'Administrator required' using errcode = '42501'; end if;
  select role into target_role from public.organization_members where org_id = target_org_id and user_id = target_user_id for update;
  if target_role is null or target_user_id = auth.uid() or target_role = 'owner' then raise exception 'Member removal forbidden' using errcode = '42501'; end if;
  if actor_role = 'admin' and target_role <> 'member' then raise exception 'Member removal forbidden' using errcode = '42501'; end if;
  if replacement_user_id = target_user_id then raise exception 'Replacement must be another member' using errcode = '22023'; end if;
  if replacement_user_id is not null then
    perform 1 from public.organization_members where org_id = target_org_id and user_id = replacement_user_id for key share;
    if not found then raise exception 'Invalid replacement member' using errcode = '23503'; end if;
  end if;
  update public.leads set owner_id = replacement_user_id where org_id = target_org_id and owner_id = target_user_id;
  get diagnostics lead_count = row_count;
  update public.lead_tasks set assigned_to = replacement_user_id where org_id = target_org_id and assigned_to = target_user_id;
  get diagnostics task_count = row_count;
  delete from public.organization_members where org_id = target_org_id and user_id = target_user_id;
  insert into public.audit_events (org_id, actor_id, action, resource_type, resource_id, metadata)
  values (target_org_id, auth.uid(), 'member.removed', 'member', target_user_id, jsonb_build_object('previous_role', target_role, 'replacement_user_id', replacement_user_id, 'leads_reassigned', lead_count, 'tasks_reassigned', task_count));
  return jsonb_build_object('leads_reassigned', lead_count, 'tasks_reassigned', task_count);
end;
$$;

revoke all on function public.set_lead_task_metadata() from public;
revoke all on function public.remove_org_member(uuid, uuid) from public;
grant execute on function public.remove_org_member(uuid, uuid) to authenticated;

commit;
