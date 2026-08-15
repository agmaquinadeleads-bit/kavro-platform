begin;

-- ETAPA 2.5: funil de conversão por etapa do pipeline. Segue o mesmo padrão
-- de 0015_dashboard_aggregations.sql, 0016_dashboard_evolution_and_origin.sql
-- e 0017_dashboard_loss_and_revenue.sql: SECURITY DEFINER, search_path
-- vazio, valida org_id via public.is_org_member(org_id) em vez de confiar
-- apenas em RLS.

-- Para CADA etapa do pipeline (mesmo as sem nenhum lead), conta quantos
-- leads (não deletados) estão nela e soma value_in_cents. Usa LEFT JOIN de
-- pipeline_stages para leads (não INNER JOIN) para não perder etapas vazias
-- do resultado — a contagem/soma é tratada com coalesce.
create or replace function public.get_dashboard_stage_funnel(p_org_id uuid, p_pipeline_id uuid)
returns table(
  stage_id uuid,
  stage_name text,
  position integer,
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
    pipeline_stages.position,
    pipeline_stages.is_won,
    pipeline_stages.is_lost,
    coalesce(count(leads.id), 0)::bigint as lead_count,
    coalesce(sum(leads.value_in_cents), 0)::bigint as total_value_in_cents
  from public.pipeline_stages
  left join public.leads
    on leads.stage_id = pipeline_stages.id
    and leads.org_id = p_org_id
    and leads.deleted_at is null
  where pipeline_stages.org_id = p_org_id
    and pipeline_stages.pipeline_id = p_pipeline_id
  group by pipeline_stages.id, pipeline_stages.name, pipeline_stages.position, pipeline_stages.is_won, pipeline_stages.is_lost
  order by pipeline_stages.position asc;
end;
$$;

revoke all on function public.get_dashboard_stage_funnel(uuid, uuid) from public;
grant execute on function public.get_dashboard_stage_funnel(uuid, uuid) to authenticated;

commit;
