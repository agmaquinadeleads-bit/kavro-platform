begin;

-- Filtro de período na visão geral (/app): adiciona p_date_from/p_date_to
-- (opcionais, default null = sem filtro) às 5 funções de agregação do
-- dashboard. CREATE OR REPLACE permite acrescentar parâmetros com default
-- no final da lista sem quebrar chamadas existentes — mesma função (mesmo
-- OID), não uma sobrecarga nova.

create or replace function public.get_dashboard_leads_evolution(
  p_org_id uuid, p_pipeline_id uuid, p_days integer default 30,
  p_date_from date default null, p_date_to date default null
)
returns table(day date, lead_count bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start date := coalesce(p_date_from, current_date - (p_days - 1));
  v_end date := coalesce(p_date_to, current_date);
begin
  if not public.is_org_member(p_org_id) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return query
  select series.day, coalesce(counts.lead_count, 0)::bigint
  from (
    select generate_series(v_start, v_end, interval '1 day')::date as day
  ) as series
  left join (
    select created_at::date as day, count(*)::bigint as lead_count
    from public.leads
    where org_id = p_org_id
      and pipeline_id = p_pipeline_id
      and deleted_at is null
      and created_at::date >= v_start
      and created_at::date <= v_end
    group by created_at::date
  ) as counts on counts.day = series.day
  order by series.day;
end;
$$;

revoke all on function public.get_dashboard_leads_evolution(uuid, uuid, integer, date, date) from public;
grant execute on function public.get_dashboard_leads_evolution(uuid, uuid, integer, date, date) to authenticated;

create or replace function public.get_dashboard_leads_by_source(
  p_org_id uuid, p_pipeline_id uuid, p_date_from date default null, p_date_to date default null
)
returns table(source text, lead_count bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_org_member(p_org_id) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return query
  select coalesce(leads.source, 'Sem origem') as source, count(*)::bigint as lead_count
  from public.leads
  where leads.org_id = p_org_id
    and leads.pipeline_id = p_pipeline_id
    and leads.deleted_at is null
    and (p_date_from is null or leads.created_at::date >= p_date_from)
    and (p_date_to is null or leads.created_at::date <= p_date_to)
  group by coalesce(leads.source, 'Sem origem')
  order by lead_count desc;
end;
$$;

revoke all on function public.get_dashboard_leads_by_source(uuid, uuid, date, date) from public;
grant execute on function public.get_dashboard_leads_by_source(uuid, uuid, date, date) to authenticated;

create or replace function public.get_dashboard_loss_reasons(
  p_org_id uuid, p_pipeline_id uuid, p_date_from date default null, p_date_to date default null
)
returns table(loss_reason text, lead_count bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_org_member(p_org_id) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return query
  select coalesce(leads.loss_reason, 'Sem motivo informado') as loss_reason, count(*)::bigint as lead_count
  from public.leads
  where leads.org_id = p_org_id
    and leads.pipeline_id = p_pipeline_id
    and leads.deleted_at is null
    and (p_date_from is null or leads.created_at::date >= p_date_from)
    and (p_date_to is null or leads.created_at::date <= p_date_to)
    and exists (
      select 1
      from public.pipeline_stages
      where pipeline_stages.org_id = p_org_id
        and pipeline_stages.pipeline_id = p_pipeline_id
        and pipeline_stages.id = leads.stage_id
        and pipeline_stages.is_lost = true
    )
  group by coalesce(leads.loss_reason, 'Sem motivo informado')
  order by lead_count desc;
end;
$$;

revoke all on function public.get_dashboard_loss_reasons(uuid, uuid, date, date) from public;
grant execute on function public.get_dashboard_loss_reasons(uuid, uuid, date, date) to authenticated;

create or replace function public.get_dashboard_revenue_by_source(
  p_org_id uuid, p_pipeline_id uuid, p_date_from date default null, p_date_to date default null
)
returns table(source text, revenue_in_cents bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_org_member(p_org_id) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return query
  select coalesce(leads.source, 'Sem origem') as source, sum(leads.value_in_cents)::bigint as revenue_in_cents
  from public.leads
  where leads.org_id = p_org_id
    and leads.pipeline_id = p_pipeline_id
    and leads.deleted_at is null
    and (p_date_from is null or leads.created_at::date >= p_date_from)
    and (p_date_to is null or leads.created_at::date <= p_date_to)
    and exists (
      select 1
      from public.pipeline_stages
      where pipeline_stages.org_id = p_org_id
        and pipeline_stages.pipeline_id = p_pipeline_id
        and pipeline_stages.id = leads.stage_id
        and pipeline_stages.is_won = true
    )
  group by coalesce(leads.source, 'Sem origem')
  order by revenue_in_cents desc;
end;
$$;

revoke all on function public.get_dashboard_revenue_by_source(uuid, uuid, date, date) from public;
grant execute on function public.get_dashboard_revenue_by_source(uuid, uuid, date, date) to authenticated;

create or replace function public.get_dashboard_stage_funnel(
  p_org_id uuid, p_pipeline_id uuid, p_date_from date default null, p_date_to date default null
)
returns table(
  stage_id uuid,
  stage_name text,
  stage_position integer,
  is_won boolean,
  is_lost boolean,
  lead_count bigint,
  total_value_in_cents bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_org_member(p_org_id) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return query
  select
    pipeline_stages.id as stage_id,
    pipeline_stages.name as stage_name,
    pipeline_stages.position as stage_position,
    pipeline_stages.is_won,
    pipeline_stages.is_lost,
    coalesce(count(leads.id), 0)::bigint as lead_count,
    coalesce(sum(leads.value_in_cents), 0)::bigint as total_value_in_cents
  from public.pipeline_stages
  left join public.leads
    on leads.stage_id = pipeline_stages.id
    and leads.org_id = p_org_id
    and leads.deleted_at is null
    and (p_date_from is null or leads.created_at::date >= p_date_from)
    and (p_date_to is null or leads.created_at::date <= p_date_to)
  where pipeline_stages.org_id = p_org_id
    and pipeline_stages.pipeline_id = p_pipeline_id
  group by pipeline_stages.id, pipeline_stages.name, pipeline_stages.position, pipeline_stages.is_won, pipeline_stages.is_lost
  order by pipeline_stages.position asc;
end;
$$;

revoke all on function public.get_dashboard_stage_funnel(uuid, uuid, date, date) from public;
grant execute on function public.get_dashboard_stage_funnel(uuid, uuid, date, date) to authenticated;

commit;
