import { createStage, renameStage } from "@/app/app/actions";
import type { DashboardLead, DashboardStage } from "@/components/dashboard";
import { KanbanBoard } from "@/components/KanbanBoard";
import { NewLeadButton } from "@/components/NewLeadButton";
import { NewStageButton } from "@/components/NewStageButton";
import { PipelineFilterBar } from "@/components/PipelineFilterBar";
import { getAuthContext } from "@/lib/auth-context";
import { validateDateFormat, validateSearchString, validateUUID } from "@/lib/filter-validation";

type PipelinePageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
    search?: string;
    stage?: string;
    owner?: string;
    origin?: string;
    creative?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  invalid_move: "A movimentação solicitada é inválida.",
  move_failed: "Não foi possível mover o lead. Para a etapa Perdido, informe o motivo.",
  invalid_archive: "Não foi possível identificar o lead.",
  archive_failed: "Não foi possível arquivar o lead.",
  stale_lead: "Esse lead foi alterado em outra sessão. A tela foi atualizada.",
  invalid_stage: "Revise os dados da etapa.",
  forbidden: "Seu perfil não pode alterar o pipeline.",
  pipeline_missing: "Pipeline não encontrado.",
  stage_limit: "O pipeline atingiu o limite de etapas.",
  stage_kind_exists: "Já existe uma etapa desse tipo especial.",
  stage_create_failed: "Não foi possível criar a etapa.",
  stage_update_failed: "Não foi possível renomear a etapa.",
  stage_move_failed: "Não foi possível mover a etapa.",
  stage_has_leads: "Mova os leads desta etapa para outra antes de excluí-la.",
  stage_last_one: "O pipeline precisa ter ao menos uma etapa.",
  stage_delete_failed: "Não foi possível excluir a etapa."
};
const successMessages: Record<string, string> = {
  stage_created: "Etapa criada com sucesso.",
  stage_renamed: "Etapa renomeada com sucesso.",
  lead_moved: "Lead movido com sucesso.",
  lead_archived: "Lead arquivado com sucesso.",
  stage_moved: "Etapa reordenada com sucesso.",
  stage_deleted: "Etapa excluída com sucesso."
};

export default async function PipelinePage({ searchParams }: PipelinePageProps) {
  const params = await searchParams;

  const { supabase, orgId } = await getAuthContext();

  // Filtros validados a partir da query string — nunca usados crus na query
  // (mesmo padrão de validateSearchString/validateUUID/validateDateFormat
  // já usado em /app/leads).
  const searchText = validateSearchString(params.search);
  const stageId = validateUUID(params.stage);
  const ownerId = validateUUID(params.owner);
  const originText = params.origin ? params.origin.trim().substring(0, 120) : null;
  const dateFrom = validateDateFormat(params.dateFrom);
  const dateTo = validateDateFormat(params.dateTo);

  const { data: pipeline } = await supabase.from("pipelines").select("id, name").eq("org_id", orgId).order("position", { ascending: true }).limit(1).maybeSingle();

  let stages: DashboardStage[] = [];
  let leads: DashboardLead[] = [];
  let origins: string[] = [];
  let members: Array<{ id: string; name: string }> = [];

  if (pipeline) {
    type StageRow = { id: string; name: string; position: number; is_won: boolean; is_lost: boolean };
    type LeadRow = { id: string; name: string; email: string | null; phone: string | null; source: string | null; stage_id: string; value_in_cents: number; version: number; follow_up_at: string | null; created_at: string };
    type OriginRow = { source: string | null };
    type MemberRow = { user_id: string; user_profiles: { full_name: string | null } | { full_name: string | null }[] | null };

    const stagesPromise: Promise<{ data: StageRow[] | null }> = Promise.resolve(
      supabase.from("pipeline_stages").select("id, name, position, is_won, is_lost").eq("org_id", orgId).eq("pipeline_id", pipeline.id).order("position", { ascending: true })
    );

    // org_id + pipeline_id vêm do contexto autenticado (membership, pipeline),
    // nunca de input do usuário — mesmo padrão usado em /app/page.tsx. Os
    // demais filtros (search/stage/owner/origin/dateFrom/dateTo) já foram
    // validados acima (whitelist de formato/UUID) antes de entrarem aqui.
    let leadsQuery = supabase
      .from("leads")
      .select("id, name, email, phone, source, stage_id, value_in_cents, version, follow_up_at, created_at")
      .eq("org_id", orgId)
      .eq("pipeline_id", pipeline.id)
      .is("deleted_at", null);

    if (searchText) {
      leadsQuery = leadsQuery.or(`name.ilike.%${searchText}%,phone.ilike.%${searchText}%,source.ilike.%${searchText}%`);
    }
    if (stageId) {
      leadsQuery = leadsQuery.eq("stage_id", stageId);
    }
    if (ownerId) {
      leadsQuery = leadsQuery.eq("owner_id", ownerId);
    }
    if (originText) {
      leadsQuery = leadsQuery.eq("source", originText);
    }
    if (dateFrom) {
      leadsQuery = leadsQuery.gte("created_at", `${dateFrom}T00:00:00Z`);
    }
    if (dateTo) {
      leadsQuery = leadsQuery.lte("created_at", `${dateTo}T23:59:59Z`);
    }

    const leadsPromise: Promise<{ data: LeadRow[] | null }> = Promise.resolve(
      leadsQuery.order("created_at", { ascending: false })
    );

    const originsPromise: Promise<{ data: OriginRow[] | null }> = Promise.resolve(
      supabase
        .from("leads")
        .select("source")
        .eq("org_id", orgId)
        .eq("pipeline_id", pipeline.id)
        .is("deleted_at", null)
        .is("source", "not.is.null")
    );

    const membersPromise: Promise<{ data: MemberRow[] | null }> = Promise.resolve(
      supabase.from("organization_members").select("user_id, user_profiles(full_name)").eq("org_id", orgId)
    );

    const [{ data: stageRows }, { data: leadRows }, { data: originRows }, { data: memberRows }] = await Promise.all([
      stagesPromise,
      leadsPromise,
      originsPromise,
      membersPromise
    ]);

    stages = (stageRows ?? []).map((stage) => ({ id: stage.id, name: stage.name, position: stage.position, isWon: stage.is_won, isLost: stage.is_lost }));
    leads = (leadRows ?? []).map((lead) => ({ id: lead.id, name: lead.name, email: lead.email, phone: lead.phone, source: lead.source, stageId: lead.stage_id, valueInCents: Number(lead.value_in_cents), version: lead.version, followUpAt: lead.follow_up_at, createdAt: lead.created_at }));
    origins = Array.from(new Set((originRows ?? []).map((row) => row.source).filter((source): source is string => source !== null))).sort();
    members = (memberRows ?? []).map((member) => {
      const profile = Array.isArray(member.user_profiles) ? member.user_profiles[0] : member.user_profiles;
      return { id: member.user_id, name: profile?.full_name || "Sem nome" };
    });
  }

  // pipelineId sempre vem de query filtrada por org_id — nunca de input do
  // usuário. Primeira etapa "aberta" (nem ganho, nem perdido), mesmo padrão
  // usado em /app/leads para o cadastro rápido de lead.
  const pipelineId: string | null = pipeline?.id ?? null;
  const firstOpenStage = stages.find((stage) => !stage.isWon && !stage.isLost);
  const firstStageId: string | null = firstOpenStage?.id ?? null;

  const pipelineName = pipeline?.name ?? "Pipeline comercial";
  const errorMessage = params.error ? errorMessages[params.error] : undefined;
  const successMessage = params.success ? successMessages[params.success] : undefined;
  const feedback = errorMessage ? { kind: "error" as const, message: errorMessage } : successMessage ? { kind: "success" as const, message: successMessage } : undefined;

  return (
    <>
      <header className="topbar">
        <div><p>PIPELINE COMERCIAL</p><h1>Pipeline</h1></div>
        <div className="pipeline-actions">
          <NewStageButton />
          <NewLeadButton pipelineId={pipelineId} firstStageId={firstStageId} />
        </div>
      </header>
      <div className="content" id="pipeline">
        {feedback ? <div className={`feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</div> : null}

        <PipelineFilterBar
          stages={stages.map((stage) => ({ id: stage.id, name: stage.name }))}
          members={members}
          origins={origins}
          currentFilters={{
            search: searchText || "",
            stage: stageId,
            owner: ownerId,
            origin: originText,
            creative: null,
            dateFrom,
            dateTo
          }}
        />

        <details className="pipeline-settings">
          <summary>Configurar etapas do pipeline</summary>
          <div className="pipeline-settings-grid">
            <form action={createStage}><h3>Nova etapa</h3><label>Nome<input name="name" required maxLength={100} /></label><label>Tipo<select name="kind" defaultValue="open"><option value="open">Em andamento</option><option value="won">Fechamento</option><option value="lost">Perda</option></select></label><button type="submit">Criar etapa</button></form>
            <div><h3>Renomear etapas</h3>{stages.map((stage) => <form className="rename-stage-form" action={renameStage} key={stage.id}><input type="hidden" name="stage_id" value={stage.id} /><input name="name" defaultValue={stage.name} required maxLength={100} aria-label={`Novo nome para ${stage.name}`} /><button type="submit">Salvar</button></form>)}</div>
          </div>
        </details>

        {pipeline ? (
          <>
            <section className="pipeline-header"><div><h2>{pipelineName}</h2><p>Dados reais do ambiente de homologação.</p></div><span>{leads.length} lead{leads.length === 1 ? "" : "s"}</span></section>
            {leads.length === 0 ? <section className="empty-state"><strong>Nenhum lead encontrado</strong><p>Ajuste os filtros ou cadastre uma nova oportunidade.</p></section> : (
              <KanbanBoard stages={stages} leads={leads} />
            )}
          </>
        ) : <div className="feedback error" role="alert">Nenhum pipeline disponível para esta organização.</div>}
      </div>
    </>
  );
}
