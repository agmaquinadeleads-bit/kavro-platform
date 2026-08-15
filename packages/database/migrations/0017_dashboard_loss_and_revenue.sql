begin;

-- ETAPA 2.4: gráfico de razões de perda (donut) e faturamento realizado por
-- origem (bar). Segue o mesmo padrão de 0015_dashboard_aggregations.sql e
-- 0016_dashboard_evolution_and_origin.sql: SECURITY DEFINER, search_path
-- vazio, valida org_id via public.is_org_member(org_id) em vez de confiar
-- apenas em RLS.

-- Leads perdidos (etapa atual com is_lost=true), agrupados por loss_reason.
create or replace function public.get_dashboard_loss_reasons(p_org_id uuid, p_pipeline_id uuid)
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

revoke all on function public.get_dashboard_loss_reasons(uuid, uuid) from public;
grant execute on function public.get_dashboard_loss_reasons(uuid, uuid) to authenticated;

-- Faturamento REALIZADO (leads na etapa atual com is_won=true), somado por
-- source. Diferente da "Receita no funil" dos KPIs (que soma leads abertos):
-- aqui é a soma de value_in_cents apenas dos leads já ganhos.
create or replace function public.get_dashboard_revenue_by_source(p_org_id uuid, p_pipeline_id uuid)
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

revoke all on function public.get_dashboard_revenue_by_source(uuid, uuid) from public;
grant execute on function public.get_dashboard_revenue_by_source(uuid, uuid) to authenticated;

commit;
