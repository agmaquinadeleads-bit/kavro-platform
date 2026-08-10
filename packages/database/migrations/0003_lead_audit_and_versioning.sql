begin;

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

  new.status := case
    when target_stage.is_won then 'won'::public.lead_status
    when target_stage.is_lost then 'lost'::public.lead_status
    else 'open'::public.lead_status
  end;
  new.loss_reason := case when target_stage.is_lost then trim(new.loss_reason) else null end;
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  return new;
end;
$$;

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

  insert into public.audit_events (org_id, actor_id, action, resource_type, resource_id, metadata)
  values (event_org_id, auth.uid(), event_action, 'lead', event_resource_id,
    jsonb_build_object('operation', tg_op));
  return coalesce(new, old);
end;
$$;

revoke all on function public.set_lead_write_metadata() from public;
revoke all on function public.audit_lead_change() from public;

drop trigger if exists leads_set_write_metadata on public.leads;
create trigger leads_set_write_metadata
before insert or update on public.leads
for each row execute function public.set_lead_write_metadata();

drop trigger if exists leads_audit_change on public.leads;
create trigger leads_audit_change
after insert or update or delete on public.leads
for each row execute function public.audit_lead_change();

revoke insert, update, delete on public.organization_members from authenticated;
grant select, insert, update, delete on public.leads to authenticated;
grant select on public.audit_events to authenticated;
revoke insert, update, delete on public.audit_events from authenticated;

commit;
