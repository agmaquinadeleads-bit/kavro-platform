begin;

-- ETAPA 2.3: gráficos de evolução de leads (line chart) e leads por origem
-- (bar chart). Segue o mesmo padrão de 0015_dashboard_aggregations.sql:
-- SECURITY DEFINER, search_path vazio, valida org_id via
-- public.is_org_member(org_id) em vez de confiar apenas em RLS.

-- Evolução diária de leads criados nos últimos p_days dias (default 30).
-- Usa generate_series para preencher dias sem leads com count=0, senão o
-- gráfico de linha fica com buracos.
create or replace function public.get_dashboard_leads_evolution(p_org_id uuid, p_pipeline_id uuid, p_days integer default 30)
returns table(day date, lead_count bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_org_member(p_org_id) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return query
  select series.day, coalesce(counts.lead_count, 0)::bigint
  from (
    select generate_series(
      current_date - (p_days - 1),
      current_date,
      interval '1 day'
    )::date as day
  ) as series
  left join (
    select created_at::date as day, count(*)::bigint as lead_count
    from public.leads
    where org_id = p_org_id
      and pipeline_id = p_pipeline_id
      and deleted_at is null
      and created_at >= (current_date - (p_days - 1))
    group by created_at::date
  ) as counts on counts.day = series.day
  order by series.day;
end;
$$;

revoke all on function public.get_dashboard_leads_evolution(uuid, uuid, integer) from public;
grant execute on function public.get_dashboard_leads_evolution(uuid, uuid, integer) to authenticated;

-- Leads agrupados por origem (source), ordenado por contagem decrescente.
create or replace function public.get_dashboard_leads_by_source(p_org_id uuid, p_pipeline_id uuid)
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
  group by coalesce(leads.source, 'Sem origem')
  order by lead_count desc;
end;
$$;

revoke all on function public.get_dashboard_leads_by_source(uuid, uuid) from public;
grant execute on function public.get_dashboard_leads_by_source(uuid, uuid) to authenticated;

commit;
