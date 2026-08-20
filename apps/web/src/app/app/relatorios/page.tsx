import { Report, type ReportFunnelStage, type ReportOwnerRow, type ReportSummary } from "@/components/Report";
import type { ReportEvolutionPoint, ReportHourPoint, ReportLossReasonPoint, ReportSourcePoint } from "@/components/report-charts";
import { getAuthContext } from "@/lib/auth-context";
import { validateDateFormat, validateSearchString, validateUUID } from "@/lib/filter-validation";

type RelatoriosPageProps = { searchParams: Promise<{ dateFrom?: string; dateTo?: string; owner?: string; source?: string }> };

export default async function RelatoriosPage({ searchParams }: RelatoriosPageProps) {
  const params = await searchParams;
  const dateFrom = validateDateFormat(params.dateFrom);
  const dateTo = validateDateFormat(params.dateTo);
  const owner = validateUUID(params.owner);
  const source = validateSearchString(params.source);

  const { supabase, orgId } = await getAuthContext();

  type PipelineRow = { id: string; name: string; position: number; is_post_sale: boolean };
  type MemberRow = { user_id: string; user_profiles: { full_name: string | null; email: string | null } | Array<{ full_name: string | null; email: string | null }> | null };
  type SummaryRow = { total_count: number; won_count: number; lost_count: number; revenue_won_cents: number; avg_ticket_cents: number; avg_closing_days: number | null };
  type EvolutionRow = { week_start: string; lead_count: number; won_count: number };
  type SourceRow = { source: string; lead_count: number; won_count: number; revenue_won_cents: number };
  type OwnerAggRow = { owner_id: string | null; lead_count: number; won_count: number; revenue_won_cents: number };
  type FunnelRow = { stage_id: string; stage_name: string; stage_position: number; is_won: boolean; is_lost: boolean; lead_count: number; total_value_in_cents: number };
  type LossRow = { loss_reason: string | null };
  type HourRow = { hour_of_day: number; lead_count: number };

  const pipelinesPromise: Promise<{ data: PipelineRow[] | null }> = Promise.resolve(
    supabase.from("pipelines").select("id, name, position, is_post_sale").eq("org_id", orgId).order("is_post_sale", { ascending: true }).order("position", { ascending: true })
  );

  const membersPromise: Promise<{ data: MemberRow[] | null }> = Promise.resolve(
    supabase.from("organization_members").select("user_id, user_profiles(full_name, email)").eq("org_id", orgId).order("created_at", { ascending: true })
  );

  const summaryPromise: Promise<{ data: SummaryRow[] | null }> = Promise.resolve(
    supabase.rpc("get_report_summary", { p_org_id: orgId, p_date_from: dateFrom, p_date_to: dateTo, p_owner_id: owner, p_source: source })
  );

  const evolutionPromise: Promise<{ data: EvolutionRow[] | null }> = Promise.resolve(
    supabase.rpc("get_report_evolution", { p_org_id: orgId, p_date_from: dateFrom, p_date_to: dateTo, p_owner_id: owner, p_source: source })
  );

  const sourcePromise: Promise<{ data: SourceRow[] | null }> = Promise.resolve(
    supabase.rpc("get_report_by_source", { p_org_id: orgId, p_date_from: dateFrom, p_date_to: dateTo, p_owner_id: owner })
  );

  const ownerAggPromise: Promise<{ data: OwnerAggRow[] | null }> = Promise.resolve(
    supabase.rpc("get_report_by_owner", { p_org_id: orgId, p_date_from: dateFrom, p_date_to: dateTo, p_source: source })
  );

  const responseTimePromise: Promise<{ data: number | null }> = Promise.resolve(
    supabase.rpc("get_report_response_time", { p_org_id: orgId, p_date_from: dateFrom, p_date_to: dateTo })
  );

  const hourPromise: Promise<{ data: HourRow[] | null }> = Promise.resolve(
    supabase.rpc("get_report_leads_by_hour", { p_org_id: orgId, p_date_from: dateFrom, p_date_to: dateTo, p_owner_id: owner, p_source: source })
  );

  let lossQuery = supabase.from("leads").select("loss_reason").eq("org_id", orgId).eq("status", "lost").is("deleted_at", null);
  if (dateFrom) lossQuery = lossQuery.gte("created_at", `${dateFrom}T00:00:00Z`);
  if (dateTo) lossQuery = lossQuery.lte("created_at", `${dateTo}T23:59:59Z`);
  if (owner) lossQuery = lossQuery.eq("owner_id", owner);
  if (source) lossQuery = lossQuery.eq("source", source);
  const lossPromise: Promise<{ data: LossRow[] | null }> = Promise.resolve(lossQuery);

  const [
    { data: pipelineRows },
    { data: memberRows },
    { data: summaryRows },
    { data: evolutionRows },
    { data: sourceRows },
    { data: ownerAggRows },
    { data: responseTimeMinutes },
    { data: lossRows },
    { data: hourRows }
  ] = await Promise.all([pipelinesPromise, membersPromise, summaryPromise, evolutionPromise, sourcePromise, ownerAggPromise, responseTimePromise, lossPromise, hourPromise]);

  // O funil cruza TODOS os pipelines da org (comercial + pós-venda), não só
  // o primeiro (diferente da Visão geral) — cada pipeline entra com uma
  // chamada separada à mesma função do dashboard, concatenadas na ordem
  // já retornada por pipelinesPromise (comercial antes de pós-venda).
  const funnelResults = await Promise.all(
    (pipelineRows ?? []).map((pipeline) => supabase.rpc("get_dashboard_stage_funnel", { p_org_id: orgId, p_pipeline_id: pipeline.id, p_date_from: dateFrom, p_date_to: dateTo }))
  );
  const funnelData: ReportFunnelStage[] = funnelResults.flatMap((result) =>
    ((result.data as FunnelRow[] | null) ?? []).map((row) => ({
      stageId: row.stage_id,
      stageName: row.stage_name,
      position: row.stage_position,
      isWon: row.is_won,
      isLost: row.is_lost,
      leadCount: Number(row.lead_count),
      totalValueInCents: Number(row.total_value_in_cents)
    }))
  );

  const members = (memberRows ?? []).map((member) => {
    const profile = Array.isArray(member.user_profiles) ? member.user_profiles[0] : member.user_profiles;
    return { id: member.user_id, name: profile?.full_name || profile?.email || "Membro da equipe" };
  });
  const memberNameById = new Map(members.map((member) => [member.id, member.name]));

  const summaryRow = (summaryRows ?? [])[0];
  const summary: ReportSummary = {
    totalCount: Number(summaryRow?.total_count ?? 0),
    wonCount: Number(summaryRow?.won_count ?? 0),
    lostCount: Number(summaryRow?.lost_count ?? 0),
    revenueWonCents: Number(summaryRow?.revenue_won_cents ?? 0),
    avgTicketCents: Number(summaryRow?.avg_ticket_cents ?? 0),
    avgClosingDays: summaryRow?.avg_closing_days !== null && summaryRow?.avg_closing_days !== undefined ? Number(summaryRow.avg_closing_days) : null
  };

  const evolutionData: ReportEvolutionPoint[] = (evolutionRows ?? []).map((row) => ({ weekStart: row.week_start, leadCount: Number(row.lead_count), wonCount: Number(row.won_count) }));
  const sourceData: ReportSourcePoint[] = (sourceRows ?? []).map((row) => ({ source: row.source, leadCount: Number(row.lead_count), wonCount: Number(row.won_count) }));

  // "Não informado" representa leads.source = NULL — não dá pra filtrar de
  // volta por esse valor via igualdade exata, então fica de fora das opções
  // do <select> de origem (continua aparecendo nos gráficos/tabelas normalmente).
  const origins = sourceData.map((point) => point.source).filter((label) => label !== "Não informado");

  const ownerRows: ReportOwnerRow[] = (ownerAggRows ?? []).map((row) => ({
    ownerId: row.owner_id,
    name: row.owner_id ? (memberNameById.get(row.owner_id) ?? "Membro removido") : "Não atribuído",
    leadCount: Number(row.lead_count),
    wonCount: Number(row.won_count),
    revenueWonCents: Number(row.revenue_won_cents)
  }));

  const lossCounts = new Map<string, number>();
  for (const row of lossRows ?? []) {
    const reason = row.loss_reason ?? "Sem motivo informado";
    lossCounts.set(reason, (lossCounts.get(reason) ?? 0) + 1);
  }
  const lossReasonData: ReportLossReasonPoint[] = Array.from(lossCounts.entries())
    .map(([lossReason, leadCount]) => ({ lossReason, leadCount }))
    .sort((a, b) => b.leadCount - a.leadCount);

  const hourData: ReportHourPoint[] = (hourRows ?? []).map((row) => ({ hour: row.hour_of_day, leadCount: Number(row.lead_count) }));

  return (
    <Report
      dateFrom={dateFrom}
      dateTo={dateTo}
      owner={owner}
      source={source}
      members={members}
      origins={origins}
      summary={summary}
      responseTimeMinutes={responseTimeMinutes ?? null}
      evolutionData={evolutionData}
      sourceData={sourceData}
      ownerRows={ownerRows}
      funnelData={funnelData}
      lossReasonData={lossReasonData}
      hourData={hourData}
    />
  );
}
