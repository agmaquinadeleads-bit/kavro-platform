begin;

-- Aba "Relatórios": diferente da Visão geral (/app, escopada a UM pipeline
-- comercial), este relatório é ORG-WIDE — soma leads de todos os pipelines
-- (comercial + pós-venda), com filtro opcional por vendedor (p_owner_id) e
-- origem (p_source). Mesmo padrão de segurança das funções em
-- 0028_dashboard_date_range_filter.sql: SECURITY DEFINER, search_path
-- vazio, revalida is_org_member(org_id) em vez de confiar só em RLS, e
-- filtro de data por leads.created_at::date (mesma convenção já usada ali).

create or replace function public.get_report_summary(
  p_org_id uuid,
  p_date_from date default null,
  p_date_to date default null,
  p_owner_id uuid default null,
  p_source text default null
)
returns table(
  total_count bigint,
  won_count bigint,
  lost_count bigint,
  revenue_won_cents bigint,
  avg_ticket_cents numeric,
  avg_closing_days numeric
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
    count(*)::bigint as total_count,
    count(*) filter (where leads.status = 'won')::bigint as won_count,
    count(*) filter (where leads.status = 'lost')::bigint as lost_count,
    coalesce(sum(leads.value_in_cents) filter (where leads.status = 'won'), 0)::bigint as revenue_won_cents,
    case when count(*) filter (where leads.status = 'won') > 0
      then coalesce(sum(leads.value_in_cents) filter (where leads.status = 'won'), 0)::numeric / count(*) filter (where leads.status = 'won')
      else 0
    end as avg_ticket_cents,
    avg(extract(epoch from (leads.updated_at - leads.created_at)) / 86400.0) filter (where leads.status = 'won') as avg_closing_days
  from public.leads
  where leads.org_id = p_org_id
    and leads.deleted_at is null
    and (p_date_from is null or leads.created_at::date >= p_date_from)
    and (p_date_to is null or leads.created_at::date <= p_date_to)
    and (p_owner_id is null or leads.owner_id = p_owner_id)
    and (p_source is null or leads.source = p_source);
end;
$$;

revoke all on function public.get_report_summary(uuid, date, date, uuid, text) from public;
grant execute on function public.get_report_summary(uuid, date, date, uuid, text) to authenticated;

-- Evolução semanal (leads criados vs. ganhos), não diária como o dashboard
-- — período de relatório costuma ser maior (inclusive "todo período"), uma
-- série diária ficaria ilegível. generate_series com bucket de semana
-- (date_trunc) preenche semanas sem leads com zero, mesma lógica de
-- get_dashboard_leads_evolution.
create or replace function public.get_report_evolution(
  p_org_id uuid,
  p_date_from date default null,
  p_date_to date default null,
  p_owner_id uuid default null,
  p_source text default null
)
returns table(week_start date, lead_count bigint, won_count bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start date;
  v_end date := coalesce(p_date_to, current_date);
begin
  if not public.is_org_member(p_org_id) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if p_date_from is not null then
    v_start := p_date_from;
  else
    select min(created_at)::date into v_start
    from public.leads
    where org_id = p_org_id and deleted_at is null;
    v_start := coalesce(v_start, v_end - 29);
  end if;

  return query
  select
    weeks.week_start,
    coalesce(count(leads.id), 0)::bigint as lead_count,
    coalesce(count(leads.id) filter (where leads.status = 'won'), 0)::bigint as won_count
  from (
    select generate_series(date_trunc('week', v_start), date_trunc('week', v_end), interval '1 week')::date as week_start
  ) as weeks
  left join public.leads
    on leads.org_id = p_org_id
    and leads.deleted_at is null
    and date_trunc('week', leads.created_at)::date = weeks.week_start
    and (p_owner_id is null or leads.owner_id = p_owner_id)
    and (p_source is null or leads.source = p_source)
  group by weeks.week_start
  order by weeks.week_start;
end;
$$;

revoke all on function public.get_report_evolution(uuid, date, date, uuid, text) from public;
grant execute on function public.get_report_evolution(uuid, date, date, uuid, text) to authenticated;

-- Leads + vendas + receita por origem (org-wide). Base tanto do gráfico
-- "Origem vs resultado" quanto do donut "Leads por origem" e dos
-- indicadores "Melhor origem"/"Melhor criativo" (derivados em JS a partir
-- do mesmo resultado — maior lead_count e maior won_count, respectivamente).
create or replace function public.get_report_by_source(
  p_org_id uuid,
  p_date_from date default null,
  p_date_to date default null,
  p_owner_id uuid default null
)
returns table(source text, lead_count bigint, won_count bigint, revenue_won_cents bigint)
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
    coalesce(leads.source, 'Não informado') as source,
    count(*)::bigint as lead_count,
    count(*) filter (where leads.status = 'won')::bigint as won_count,
    coalesce(sum(leads.value_in_cents) filter (where leads.status = 'won'), 0)::bigint as revenue_won_cents
  from public.leads
  where leads.org_id = p_org_id
    and leads.deleted_at is null
    and (p_date_from is null or leads.created_at::date >= p_date_from)
    and (p_date_to is null or leads.created_at::date <= p_date_to)
    and (p_owner_id is null or leads.owner_id = p_owner_id)
  group by coalesce(leads.source, 'Não informado')
  order by lead_count desc;
end;
$$;

revoke all on function public.get_report_by_source(uuid, date, date, uuid) from public;
grant execute on function public.get_report_by_source(uuid, date, date, uuid) to authenticated;

-- Leads + vendas + receita por vendedor (owner_id). owner_id nulo (lead sem
-- responsável) forma seu próprio grupo — o frontend rotula como "Não
-- atribuído". Base da tabela "Vendedor vs resultado" e do "Top 3
-- vendedores" (derivado em JS, maior revenue_won_cents).
create or replace function public.get_report_by_owner(
  p_org_id uuid,
  p_date_from date default null,
  p_date_to date default null,
  p_source text default null
)
returns table(owner_id uuid, lead_count bigint, won_count bigint, revenue_won_cents bigint)
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
    leads.owner_id,
    count(*)::bigint as lead_count,
    count(*) filter (where leads.status = 'won')::bigint as won_count,
    coalesce(sum(leads.value_in_cents) filter (where leads.status = 'won'), 0)::bigint as revenue_won_cents
  from public.leads
  where leads.org_id = p_org_id
    and leads.deleted_at is null
    and (p_date_from is null or leads.created_at::date >= p_date_from)
    and (p_date_to is null or leads.created_at::date <= p_date_to)
    and (p_source is null or leads.source = p_source)
  group by leads.owner_id
  order by lead_count desc;
end;
$$;

revoke all on function public.get_report_by_owner(uuid, date, date, text) from public;
grant execute on function public.get_report_by_owner(uuid, date, date, text) to authenticated;

-- Tempo médio de resposta (minutos): para cada mensagem outbound, olha a
-- mensagem imediatamente anterior na mesma conversa via lag() — se ela foi
-- inbound, essa é uma resposta real, e o intervalo entra na média. Ignora
-- intervalos > 48h (conversa abandonada e retomada dias depois distorceria
-- a média sem refletir "tempo de resposta" de verdade).
create or replace function public.get_report_response_time(
  p_org_id uuid,
  p_date_from date default null,
  p_date_to date default null
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  result numeric;
begin
  if not public.is_org_member(p_org_id) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  with ordered as (
    select
      direction,
      created_at,
      lag(direction) over (partition by conversation_id order by created_at) as prev_direction,
      lag(created_at) over (partition by conversation_id order by created_at) as prev_created_at
    from public.whatsapp_messages
    where org_id = p_org_id
      and (p_date_from is null or created_at::date >= p_date_from)
      and (p_date_to is null or created_at::date <= p_date_to)
  )
  select avg(extract(epoch from (created_at - prev_created_at)) / 60.0)
  into result
  from ordered
  where direction = 'outbound'
    and prev_direction = 'inbound'
    and created_at - prev_created_at < interval '48 hours';

  return result;
end;
$$;

revoke all on function public.get_report_response_time(uuid, date, date) from public;
grant execute on function public.get_report_response_time(uuid, date, date) to authenticated;

commit;
