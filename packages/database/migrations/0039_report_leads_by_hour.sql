begin;

-- Distribuição de leads por horário do dia (0-23h) — permite identificar
-- picos de chegada (manhã/tarde/noite) para a aba Relatórios. Mesmo padrão
-- de segurança de 0038_relatorios.sql: SECURITY DEFINER, search_path
-- vazio, revalida is_org_member.
--
-- O filtro de período (p_date_from/p_date_to) segue a MESMA convenção de
-- data UTC já usada em todas as outras funções de relatório
-- (leads.created_at::date), para o "período" selecionado no filtro
-- significar a mesma coisa em toda a página. Já a EXTRAÇÃO da hora usa
-- "at time zone 'America/Sao_Paulo'" — leads.created_at é armazenado em
-- UTC, e um gráfico de "que horas os leads chegam" só faz sentido no
-- horário local de quem está lendo (senão o pico apareceria deslocado em
-- -3h). São Paulo não observa horário de verão desde 2019, então um offset
-- fixo de -03:00 é seguro aqui.
create or replace function public.get_report_leads_by_hour(
  p_org_id uuid,
  p_date_from date default null,
  p_date_to date default null,
  p_owner_id uuid default null,
  p_source text default null
)
returns table(hour_of_day integer, lead_count bigint)
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
    hours.hour_of_day,
    coalesce(count(leads.id), 0)::bigint as lead_count
  from generate_series(0, 23) as hours(hour_of_day)
  left join public.leads
    on leads.org_id = p_org_id
    and leads.deleted_at is null
    and extract(hour from (leads.created_at at time zone 'America/Sao_Paulo'))::integer = hours.hour_of_day
    and (p_date_from is null or leads.created_at::date >= p_date_from)
    and (p_date_to is null or leads.created_at::date <= p_date_to)
    and (p_owner_id is null or leads.owner_id = p_owner_id)
    and (p_source is null or leads.source = p_source)
  group by hours.hour_of_day
  order by hours.hour_of_day;
end;
$$;

revoke all on function public.get_report_leads_by_hour(uuid, date, date, uuid, text) from public;
grant execute on function public.get_report_leads_by_hour(uuid, date, date, uuid, text) to authenticated;

commit;
