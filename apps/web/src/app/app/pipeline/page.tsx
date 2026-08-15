import { redirect } from "next/navigation";
import { createStage, renameStage } from "@/app/app/actions";
import type { DashboardLead, DashboardStage } from "@/components/dashboard";
import { KanbanBoard } from "@/components/KanbanBoard";
import { createClient } from "@/lib/supabase/server";

type PipelinePageProps = { searchParams: Promise<{ error?: string; success?: string }> };

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
  stage_update_failed: "Não foi possível renomear a etapa."
};
const successMessages: Record<string, string> = {
  stage_created: "Etapa criada com sucesso.",
  stage_renamed: "Etapa renomeada com sucesso.",
  lead_moved: "Lead movido com sucesso.",
  lead_archived: "Lead arquivado com sucesso."
};

export default async function PipelinePage({ searchParams }: PipelinePageProps) {
  const params = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: membership } = await supabase.from("organization_members").select("org_id, role").eq("user_id", user.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!membership) redirect("/onboarding");

  const { data: pipeline } = await supabase.from("pipelines").select("id, name").eq("org_id", membership.org_id).order("position", { ascending: true }).limit(1).maybeSingle();

  let stages: DashboardStage[] = [];
  let leads: DashboardLead[] = [];

  if (pipeline) {
    type StageRow = { id: string; name: string; position: number; is_won: boolean; is_lost: boolean };
    type LeadRow = { id: string; name: string; email: string | null; phone: string | null; source: string | null; stage_id: string; value_in_cents: number; version: number; follow_up_at: string | null; created_at: string };

    // org_id + pipeline_id vêm do contexto autenticado (membership, pipeline),
    // nunca de input do usuário — mesmo padrão usado em /app/page.tsx.
    const stagesPromise: Promise<{ data: StageRow[] | null }> = Promise.resolve(
      supabase.from("pipeline_stages").select("id, name, position, is_won, is_lost").eq("org_id", membership.org_id).eq("pipeline_id", pipeline.id).order("position", { ascending: true })
    );
    const leadsPromise: Promise<{ data: LeadRow[] | null }> = Promise.resolve(
      supabase.from("leads").select("id, name, email, phone, source, stage_id, value_in_cents, version, follow_up_at, created_at").eq("org_id", membership.org_id).eq("pipeline_id", pipeline.id).is("deleted_at", null).order("created_at", { ascending: false })
    );

    const [{ data: stageRows }, { data: leadRows }] = await Promise.all([stagesPromise, leadsPromise]);

    stages = (stageRows ?? []).map((stage) => ({ id: stage.id, name: stage.name, position: stage.position, isWon: stage.is_won, isLost: stage.is_lost }));
    leads = (leadRows ?? []).map((lead) => ({ id: lead.id, name: lead.name, email: lead.email, phone: lead.phone, source: lead.source, stageId: lead.stage_id, valueInCents: Number(lead.value_in_cents), version: lead.version, followUpAt: lead.follow_up_at, createdAt: lead.created_at }));
  }

  const pipelineName = pipeline?.name ?? "Pipeline comercial";
  const errorMessage = params.error ? errorMessages[params.error] : undefined;
  const successMessage = params.success ? successMessages[params.success] : undefined;
  const feedback = errorMessage ? { kind: "error" as const, message: errorMessage } : successMessage ? { kind: "success" as const, message: successMessage } : undefined;

  return (
    <>
      <header className="topbar"><div><p>PIPELINE COMERCIAL</p><h1>Pipeline</h1></div></header>
      <div className="content" id="pipeline">
        {feedback ? <div className={`feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</div> : null}

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
            {leads.length === 0 ? <section className="empty-state"><strong>Nenhum lead ainda</strong><p>Cadastre a primeira oportunidade na página de Leads.</p></section> : (
              <KanbanBoard stages={stages} leads={leads} />
            )}
          </>
        ) : <div className="feedback error" role="alert">Nenhum pipeline disponível para esta organização.</div>}
      </div>
    </>
  );
}
