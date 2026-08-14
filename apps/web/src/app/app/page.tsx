import { redirect } from "next/navigation";
import { Dashboard, type DashboardLead, type DashboardStage, type DashboardTask } from "@/components/dashboard";
import { createClient } from "@/lib/supabase/server";

type AppPageProps = { searchParams: Promise<{ error?: string; success?: string; q?: string; stage?: string; page?: string; tasks?: string }> };
const PAGE_SIZE = 25;
const errorMessages: Record<string, string> = { invalid_lead: "Revise os dados do lead.", create_failed: "Não foi possível criar o lead.", invalid_move: "A movimentação solicitada é inválida.", move_failed: "Não foi possível mover o lead. Para a etapa Perdido, informe o motivo.", invalid_archive: "Não foi possível identificar o lead.", archive_failed: "Não foi possível arquivar o lead.", stale_lead: "Esse lead foi alterado em outra sessão. A tela foi atualizada.", invalid_stage: "Revise os dados da etapa.", forbidden: "Seu perfil não pode alterar o pipeline.", pipeline_missing: "Pipeline não encontrado.", stage_limit: "O pipeline atingiu o limite de etapas.", stage_kind_exists: "Já existe uma etapa desse tipo especial.", stage_create_failed: "Não foi possível criar a etapa.", stage_update_failed: "Não foi possível renomear a etapa." };
const successMessages: Record<string, string> = { lead_created: "Lead adicionado ao pipeline.", lead_moved: "Lead movido com sucesso.", lead_archived: "Lead arquivado com sucesso.", stage_created: "Etapa criada com sucesso.", stage_renamed: "Etapa renomeada com sucesso.", invitation_accepted: "Convite aceito. Você já faz parte da equipe." };

export default async function AppPage({ searchParams }: AppPageProps) {
  const params = await searchParams;
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const search = (params.q ?? "").trim().slice(0, 80);
  const safeSearch = search.replace(/[%_,().]/g, "");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase.from("organization_members").select("org_id, role").eq("user_id", user.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!membership) redirect("/onboarding");

  const [{ data: organization }, { data: pipeline }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", membership.org_id).single(),
    supabase.from("pipelines").select("id, name").eq("org_id", membership.org_id).order("position", { ascending: true }).limit(1).maybeSingle()
  ]);

  let stages: DashboardStage[] = [];
  let leads: DashboardLead[] = [];
  let totalCount = 0;
  let tasks: DashboardTask[] = [];

  const canSeeTeamTasks = membership.role === "owner" || membership.role === "admin";
  let taskQuery = supabase.from("lead_tasks").select("id, lead_id, title, due_at, completed_at, assigned_to, version, leads!inner(name, deleted_at)").eq("org_id", membership.org_id).is("completed_at", null).is("leads.deleted_at", null).order("due_at", { ascending: true, nullsFirst: false }).limit(12);
  if (!canSeeTeamTasks || params.tasks !== "all") taskQuery = taskQuery.eq("assigned_to", user.id);

  type StageRow = { id: string; name: string; position: number; is_won: boolean; is_lost: boolean };
  const stagesPromise: Promise<{ data: StageRow[] | null }> = pipeline
    ? supabase.from("pipeline_stages").select("id, name, position, is_won, is_lost").eq("org_id", membership.org_id).eq("pipeline_id", pipeline.id).order("position", { ascending: true })
    : Promise.resolve({ data: null });

  // Tasks are independent of the pipeline/stage/lead lookups below, so run them
  // in parallel instead of waiting on that chain first (saves a full round-trip).
  const [{ data: stageRows }, { data: taskRows }] = await Promise.all([stagesPromise, taskQuery]);

  if (pipeline) {
    stages = (stageRows ?? []).map((stage) => ({ id: stage.id, name: stage.name, position: stage.position, isWon: stage.is_won, isLost: stage.is_lost }));

    let leadQuery = supabase.from("leads").select("id, name, email, phone, source, stage_id, value_in_cents, version, follow_up_at, created_at", { count: "exact" }).eq("org_id", membership.org_id).eq("pipeline_id", pipeline.id).is("deleted_at", null);
    if (safeSearch) leadQuery = leadQuery.or(`name.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%,source.ilike.%${safeSearch}%`);
    if (params.stage && stages.some((stage) => stage.id === params.stage)) leadQuery = leadQuery.eq("stage_id", params.stage);
    const from = (requestedPage - 1) * PAGE_SIZE;
    const { data: leadRows, count } = await leadQuery.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
    totalCount = count ?? 0;
    leads = (leadRows ?? []).map((lead) => ({ id: lead.id, name: lead.name, email: lead.email, phone: lead.phone, source: lead.source, stageId: lead.stage_id, valueInCents: Number(lead.value_in_cents), version: lead.version, followUpAt: lead.follow_up_at, createdAt: lead.created_at }));
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
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return <Dashboard userName={userName} organizationName={organization?.name ?? "Organização"} pipelineId={pipeline?.id ?? null} pipelineName={pipeline?.name ?? "Pipeline comercial"} stages={stages} leads={leads} tasks={tasks} taskScope={canSeeTeamTasks && params.tasks === "all" ? "all" : "mine"} canSeeTeamTasks={canSeeTeamTasks} totalCount={totalCount} currentPage={Math.min(requestedPage, totalPages)} totalPages={totalPages} filters={{ search, stageId: params.stage ?? "" }} feedback={feedback} />;
}
