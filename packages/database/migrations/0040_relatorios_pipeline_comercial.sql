begin;

-- Relatórios estava somando leads de TODOS os pipelines da org, incluindo
-- os "de sistema" (Pós-venda, Parceiros e fornecedores — ver
-- 0021_pipeline_delete_protection.sql) que não são leads comerciais de
-- verdade. Mesma convenção já usada em create_lead_from_whatsapp
-- (0034), get_ad_creative_source_pipeline (0035) e a RPC de
-- recreate-lead-after-archive (0036): "lead comercial de verdade" é
-- aquele cujo pipeline não é pós-venda nem protegido.
--
-- CREATE OR REPLACE mantém a mesma assinatura das 4 funções (mesmo OID) —
-- só adiciona o filtro de pipeline ao WHERE, sem precisar de parâmetro
-- novo nem mudar nada no lado do Next.js que já chama essas RPCs.

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
    and leads.pipeline_id in (select id from public.pipelines where org_id = p_org_id and not is_post_sale and not is_protected)
    and (p_date_from is null or leads.created_at::date >= p_date_from)
    and (p_date_to is null or leads.created_at::date <= p_date_to)
    and (p_owner_id is null or leads.owner_id = p_owner_id)
    and (p_source is null or leads.source = p_source);
end;
$$;

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
    where org_id = p_org_id and deleted_at is null
      and pipeline_id in (select id from public.pipelines where org_id = p_org_id and not is_post_sale and not is_protected);
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
    and leads.pipeline_id in (select id from public.pipelines where org_id = p_org_id and not is_post_sale and not is_protected)
    and date_trunc('week', leads.created_at)::date = weeks.week_start
    and (p_owner_id is null or leads.owner_id = p_owner_id)
    and (p_source is null or leads.source = p_source)
  group by weeks.week_start
  order by weeks.week_start;
end;
$$;

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
    and leads.pipeline_id in (select id from public.pipelines where org_id = p_org_id and not is_post_sale and not is_protected)
    and (p_date_from is null or leads.created_at::date >= p_date_from)
    and (p_date_to is null or leads.created_at::date <= p_date_to)
    and (p_owner_id is null or leads.owner_id = p_owner_id)
  group by coalesce(leads.source, 'Não informado')
  order by lead_count desc;
end;
$$;

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
    and leads.pipeline_id in (select id from public.pipelines where org_id = p_org_id and not is_post_sale and not is_protected)
    and (p_date_from is null or leads.created_at::date >= p_date_from)
    and (p_date_to is null or leads.created_at::date <= p_date_to)
    and (p_source is null or leads.source = p_source)
  group by leads.owner_id
  order by lead_count desc;
end;
$$;

-- get_report_leads_by_hour (0039) segue o mesmo padrão.
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
    and leads.pipeline_id in (select id from public.pipelines where org_id = p_org_id and not is_post_sale and not is_protected)
    and extract(hour from (leads.created_at at time zone 'America/Sao_Paulo'))::integer = hours.hour_of_day
    and (p_date_from is null or leads.created_at::date >= p_date_from)
    and (p_date_to is null or leads.created_at::date <= p_date_to)
    and (p_owner_id is null or leads.owner_id = p_owner_id)
    and (p_source is null or leads.source = p_source)
  group by hours.hour_of_day
  order by hours.hour_of_day;
end;
$$;

commit;
