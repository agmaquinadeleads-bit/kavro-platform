begin;

-- Camada de agregação para o dashboard (ETAPA 2: KPIs e gráficos).
-- Convenção: toda função de agregação usa o prefixo get_dashboard_*,
-- é SECURITY DEFINER e valida org_id internamente via public.is_org_member(org_id)
-- em vez de confiar apenas em RLS. O search_path vazio força qualificação
-- explícita de schema em todas as referências (mesmo padrão de 0001_foundation.sql
-- e 0014_lead_activities.sql).

-- Função-piloto: valida o padrão ponta a ponta. Será substituída/expandida
-- pelas próximas tasks (KPIs completos, evolução/origem, perda/faturamento, funil).
create or replace function public.get_dashboard_leads_total(p_org_id uuid)
returns table(total_count bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_org_member(p_org_id) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return query
  select count(*)::bigint
  from public.leads
  where org_id = p_org_id
    and deleted_at is null;
end;
$$;

revoke all on function public.get_dashboard_leads_total(uuid) from public;
grant execute on function public.get_dashboard_leads_total(uuid) to authenticated;

commit;
