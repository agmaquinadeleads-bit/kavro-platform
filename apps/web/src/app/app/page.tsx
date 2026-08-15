import { redirect } from "next/navigation";
import { Dashboard, type DashboardEvolutionPoint, type DashboardLossReasonPoint, type DashboardOriginPoint, type DashboardRevenuePoint, type DashboardStage, type DashboardTask } from "@/components/dashboard";
import { createClient } from "@/lib/supabase/server";

type AppPageProps = { searchParams: Promise<{ error?: string; success?: string; tasks?: string }> };
const errorMessages: Record<string, string> = { invalid_lead: "Revise os dados do lead.", create_failed: "Não foi possível criar o lead.", invalid_move: "A movimentação solicitada é inválida.", move_failed: "Não foi possível mover o lead. Para a etapa Perdido, informe o motivo.", invalid_archive: "Não foi possível identificar o lead.", archive_failed: "Não foi possível arquivar o lead.", stale_lead: "Esse lead foi alterado em outra sessão. A tela foi atualizada.", invalid_stage: "Revise os dados da etapa.", forbidden: "Seu perfil não pode alterar o pipeline.", pipeline_missing: "Pipeline não encontrado.", stage_limit: "O pipeline atingiu o limite de etapas.", stage_kind_exists: "Já existe uma etapa desse tipo especial.", stage_create_failed: "Não foi possível criar a etapa.", stage_update_failed: "Não foi possível renomear a etapa." };
const successMessages: Record<string, string> = { lead_created: "Lead adicionado ao pipeline.", lead_moved: "Lead movido com sucesso.", lead_archived: "Lead arquivado com sucesso.", stage_created: "Etapa criada com sucesso.", stage_renamed: "Etapa renomeada com sucesso.", invitation_accepted: "Convite aceito. Você já faz parte da equipe." };

export default async function AppPage({ searchParams }: AppPageProps) {
  const params = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase.from("organization_members").select("org_id, role").eq("user_id", user.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!membership) redirect("/onboarding");

  const { data: pipeline } = await supabase.from("pipelines").select("id, name").eq("org_id", membership.org_id).order("position", { ascending: true }).limit(1).maybeSingle();

  let stages: DashboardStage[] = [];
  let totalCount = 0;
  let tasks: DashboardTask[] = [];
  let openLeadsCount = 0;
  let wonLeadsCount = 0;
  let openRevenueInCents = 0;
  let leadsLast7Days = 0;
  let overdueFollowUpsCount = 0;
  let todayFollowUpsCount = 0;
  let evolutionData: DashboardEvolutionPoint[] = [];
  let originData: DashboardOriginPoint[] = [];
  let lossReasonData: DashboardLossReasonPoint[] = [];
  let revenueData: DashboardRevenuePoint[] = [];

  const canSeeTeamTasks = membership.role === "owner" || membership.role === "admin";
  let taskQuery = supabase.from("lead_tasks").select("id, lead_id, title, due_at, completed_at, assigned_to, version, leads!inner(name, deleted_at)").eq("org_id", membership.org_id).is("completed_at", null).is("leads.deleted_at", null).order("due_at", { ascending: true, nullsFirst: false }).limit(12);
  if (!canSeeTeamTasks || params.tasks !== "all") taskQuery = taskQuery.eq("assigned_to", user.id);

  type StageRow = { id: string; name: string; position: number; is_won: boolean; is_lost: boolean };
  const stagesPromise: Promise<{ data: StageRow[] | null }> = pipeline
    ? Promise.resolve(supabase.from("pipeline_stages").select("id, name, position, is_won, is_lost").eq("org_id", membership.org_id).eq("pipeline_id", pipeline.id).order("position", { ascending: true }))
    : Promise.resolve({ data: null });

  // Tasks are independent of the pipeline/stage/lead lookups below, so run them
  // in parallel instead of waiting on that chain first (saves a full round-trip).
  const [{ data: stageRows }, { data: taskRows }] = await Promise.all([stagesPromise, taskQuery]);

  if (pipeline) {
    stages = (stageRows ?? []).map((stage) => ({ id: stage.id, name: stage.name, position: stage.position, isWon: stage.is_won, isLost: stage.is_lost }));

    // KPI queries below are org+pipeline scoped counts/aggregates — the dashboard
    // no longer renders a paginated lead list (moved to /app/leads e /app/pipeline),
    // so every metric here comes straight from a count/aggregate query.
    const openStageIds: string[] = stages.filter((stage) => !stage.isWon && !stage.isLost).map((stage) => stage.id);
    const wonStageIds: string[] = stages.filter((stage) => stage.isWon).map((stage) => stage.id);
    const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();
    // Limites do "dia de hoje" no fuso de São Paulo (sem DST desde 2019, UTC-3 fixo),
    // usados só para o alerta de follow-ups de hoje.
    const saoPauloDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    const todayStartIso = new Date(`${saoPauloDay}T00:00:00-03:00`).toISOString();
    const todayEndIso = new Date(`${saoPauloDay}T23:59:59.999-03:00`).toISOString();

    type CountResult = { count: number | null };
    type ValueRows = { data: { value_in_cents: number }[] | null };

    const totalCountPromise: Promise<CountResult> = Promise.resolve(
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", membership.org_id).eq("pipeline_id", pipeline.id).is("deleted_at", null)
    );

    const openLeadsCountPromise: Promise<CountResult> = openStageIds.length
      ? Promise.resolve(supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", membership.org_id).eq("pipeline_id", pipeline.id).is("deleted_at", null).in("stage_id", openStageIds))
      : Promise.resolve({ count: 0 });

    const wonLeadsCountPromise: Promise<CountResult> = wonStageIds.length
      ? Promise.resolve(supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", membership.org_id).eq("pipeline_id", pipeline.id).is("deleted_at", null).in("stage_id", wonStageIds))
      : Promise.resolve({ count: 0 });

    const openRevenuePromise: Promise<ValueRows> = openStageIds.length
      ? Promise.resolve(supabase.from("leads").select("value_in_cents").eq("org_id", membership.org_id).eq("pipeline_id", pipeline.id).is("deleted_at", null).in("stage_id", openStageIds))
      : Promise.resolve({ data: [] });

    const last7DaysCountPromise: Promise<CountResult> = Promise.resolve(
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", membership.org_id).eq("pipeline_id", pipeline.id).is("deleted_at", null).gte("created_at", sevenDaysAgoIso)
    );

    const overdueCountPromise: Promise<CountResult> = Promise.resolve(
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", membership.org_id).eq("pipeline_id", pipeline.id).is("deleted_at", null).lt("follow_up_at", nowIso)
    );

    const todayCountPromise: Promise<CountResult> = Promise.resolve(
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("org_id", membership.org_id).eq("pipeline_id", pipeline.id).is("deleted_at", null).gte("follow_up_at", todayStartIso).lte("follow_up_at", todayEndIso)
    );

    // Séries agregadas dos gráficos (evolução diária, leads por origem,
    // razões de perda, faturamento realizado por origem). org_id/pipeline_id
    // sempre vêm do contexto autenticado (membership, pipeline), nunca de
    // input do usuário. As funções SQL revalidam org_id internamente via
    // is_org_member (defesa em profundidade).
    type EvolutionRow = { day: string; lead_count: number };
    type OriginRow = { source: string; lead_count: number };
    type LossReasonRow = { loss_reason: string; lead_count: number };
    type RevenueRow = { source: string; revenue_in_cents: number };

    const evolutionPromise: Promise<{ data: EvolutionRow[] | null }> = Promise.resolve(
      supabase.rpc("get_dashboard_leads_evolution", { p_org_id: membership.org_id, p_pipeline_id: pipeline.id, p_days: 30 })
    );

    const originPromise: Promise<{ data: OriginRow[] | null }> = Promise.resolve(
      supabase.rpc("get_dashboard_leads_by_source", { p_org_id: membership.org_id, p_pipeline_id: pipeline.id })
    );

    const lossReasonPromise: Promise<{ data: LossReasonRow[] | null }> = Promise.resolve(
      supabase.rpc("get_dashboard_loss_reasons", { p_org_id: membership.org_id, p_pipeline_id: pipeline.id })
    );

    const revenuePromise: Promise<{ data: RevenueRow[] | null }> = Promise.resolve(
      supabase.rpc("get_dashboard_revenue_by_source", { p_org_id: membership.org_id, p_pipeline_id: pipeline.id })
    );

    const [
      { count: totalLeadsCount },
      { count: openCount },
      { count: wonCount },
      { data: openRevenueRows },
      { count: last7Count },
      { count: overdueCount },
      { count: todayCount },
      { data: evolutionRows },
      { data: originRows },
      { data: lossReasonRows },
      { data: revenueRows },
    ] = await Promise.all([
      totalCountPromise,
      openLeadsCountPromise,
      wonLeadsCountPromise,
      openRevenuePromise,
      last7DaysCountPromise,
      overdueCountPromise,
      todayCountPromise,
      evolutionPromise,
      originPromise,
      lossReasonPromise,
      revenuePromise,
    ]);

    totalCount = totalLeadsCount ?? 0;
    openLeadsCount = openCount ?? 0;
    wonLeadsCount = wonCount ?? 0;
    openRevenueInCents = (openRevenueRows ?? []).reduce((sum, row) => sum + Number(row.value_in_cents), 0);
    leadsLast7Days = last7Count ?? 0;
    overdueFollowUpsCount = overdueCount ?? 0;
    todayFollowUpsCount = todayCount ?? 0;
    evolutionData = (evolutionRows ?? []).map((row) => ({ day: row.day, leadCount: Number(row.lead_count) }));
    originData = (originRows ?? []).map((row) => ({ source: row.source, leadCount: Number(row.lead_count) }));
    lossReasonData = (lossReasonRows ?? []).map((row) => ({ lossReason: row.loss_reason, leadCount: Number(row.lead_count) }));
    revenueData = (revenueRows ?? []).map((row) => ({ source: row.source, revenueInCents: Number(row.revenue_in_cents) }));
  }

  tasks = (taskRows ?? []).map((task) => {
    const relatedLead = Array.isArray(task.leads) ? task.leads[0] : task.leads;
    return { id: task.id, leadId: task.lead_id, leadName: relatedLead?.name ?? "Lead", title: task.title, dueAt: task.due_at, assignedTo: task.assigned_to, version: task.version };
  });

  const metadataName = user.user_metadata?.full_name;
  const userName = typeof metadataName === "string" && metadataName.trim() ? metadataName.trim() : user.email?.split("@")[0] ?? "Usuário";
  const errorMessage = params.error ? errorMessages[params.error] : undefined;
  const successMessage = params.success ? successMessages[params.success] : undefined;
  const feedback = errorMessage ? { kind: "error" as const, message: errorMessage } : successMessage ? { kind: "success" as const, message: successMessage } : undefined;

  return <Dashboard userName={userName} tasks={tasks} taskScope={canSeeTeamTasks && params.tasks === "all" ? "all" : "mine"} canSeeTeamTasks={canSeeTeamTasks} totalCount={totalCount} feedback={feedback} openLeadsCount={openLeadsCount} wonLeadsCount={wonLeadsCount} openRevenueInCents={openRevenueInCents} leadsLast7Days={leadsLast7Days} overdueFollowUpsCount={overdueFollowUpsCount} todayFollowUpsCount={todayFollowUpsCount} evolutionData={evolutionData} originData={originData} lossReasonData={lossReasonData} revenueData={revenueData} />;
}
