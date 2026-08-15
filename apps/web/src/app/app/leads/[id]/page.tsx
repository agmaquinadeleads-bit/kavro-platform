import Link from "next/link";
import { notFound } from "next/navigation";
import { assignLead, createLeadTask, toggleLeadTask, updateLead } from "@/app/app/actions";
import { getAuthContext } from "@/lib/auth-context";

type LeadDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
};

const errorMessages: Record<string, string> = {
  invalid_lead: "Revise os campos informados.",
  invalid_date: "A data de follow-up é inválida.",
  update_failed: "Não foi possível atualizar o lead.",
  stale_lead: "Esse lead foi alterado em outra sessão. Recarregue e tente novamente.",
  invalid_task: "Informe um título válido para a tarefa.",
  invalid_task_date: "A data da tarefa é inválida.",
  task_create_failed: "Não foi possível criar a tarefa. Confirme se a migração 0004 foi aplicada.",
  task_update_failed: "Não foi possível atualizar a tarefa.",
  stale_task: "Essa tarefa foi alterada em outra sessão. Recarregue e tente novamente.",
  invalid_assignment: "O responsável selecionado é inválido.",
  assignment_forbidden: "Seu perfil só pode assumir o lead para si mesmo.",
  assignment_failed: "Não foi possível alterar o responsável. Confirme se a migração 0005 foi aplicada."
};

function dateTimeLocal(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 16) : "";
}

function eventLabel(action: string) {
  return ({
    "lead.created": "Lead criado",
    "lead.updated": "Informações atualizadas",
    "lead.stage_changed": "Etapa alterada",
    "lead.archived": "Lead arquivado",
    "lead_task.created": "Tarefa criada",
    "lead_task.completed": "Tarefa concluída",
    "lead_task.reopened": "Tarefa reaberta",
    "lead_task.updated": "Tarefa atualizada"
  } as Record<string, string>)[action] ?? action;
}

export default async function LeadDetailPage({ params, searchParams }: LeadDetailPageProps) {
  const { id } = await params;
  const { supabase, orgId } = await getAuthContext();

  const [{ data: lead }, { data: events }, { data: tasks }, { data: members }] = await Promise.all([
    supabase.from("leads").select("id, name, email, phone, source, value_in_cents, follow_up_at, notes, status, owner_id, version, created_at, updated_at").eq("id", id).eq("org_id", orgId).is("deleted_at", null).maybeSingle(),
    supabase.from("audit_events").select("id, action, created_at").eq("org_id", orgId).eq("resource_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.from("lead_tasks").select("id, title, description, due_at, completed_at, version, created_at").eq("org_id", orgId).eq("lead_id", id).order("completed_at", { ascending: true, nullsFirst: true }).order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("organization_members").select("user_id, role, user_profiles(full_name, email)").eq("org_id", orgId).order("created_at")
  ]);
  if (!lead) notFound();

  const feedback = await searchParams;
  const errorMessage = feedback.error ? errorMessages[feedback.error] : undefined;

  return (
    <main className="detail-page">
      <div className="detail-shell">
        <header className="detail-header"><div><Link href="/app">← Voltar ao pipeline</Link><p className="eyebrow">DETALHES DO LEAD</p><h1>{lead.name}</h1><span className={`status-badge ${lead.status}`}>{lead.status === "won" ? "Fechado" : lead.status === "lost" ? "Perdido" : "Em andamento"}</span></div></header>
        {errorMessage ? <div className="feedback error" role="alert">{errorMessage}</div> : null}
        {feedback.success ? <div className="feedback success" role="status">{feedback.success === "task_created" ? "Tarefa criada com sucesso." : feedback.success === "task_updated" ? "Tarefa atualizada com sucesso." : feedback.success === "lead_assigned" ? "Responsável atualizado com sucesso." : "Lead atualizado com sucesso."}</div> : null}

        <div className="detail-grid">
          <section className="detail-card">
            <h2>Informações</h2>
            <form className="assignment-form" action={assignLead}>
              <input type="hidden" name="lead_id" value={lead.id} /><input type="hidden" name="version" value={lead.version} />
              <label>Responsável<select name="owner_id" defaultValue={lead.owner_id ?? ""}><option value="">Sem responsável</option>{(members ?? []).map((member) => { const profile = Array.isArray(member.user_profiles) ? member.user_profiles[0] : member.user_profiles; return <option key={member.user_id} value={member.user_id}>{profile?.full_name || profile?.email || "Membro da equipe"} · {member.role}</option>; })}</select></label>
              <button type="submit">Atribuir</button>
            </form>
            <form className="lead-edit-form" action={updateLead}>
              <input type="hidden" name="lead_id" value={lead.id} /><input type="hidden" name="version" value={lead.version} />
              <label>Nome*<input name="name" defaultValue={lead.name} required maxLength={160} /></label>
              <label>Telefone<input name="phone" defaultValue={lead.phone ?? ""} maxLength={32} /></label>
              <label>E-mail<input name="email" type="email" defaultValue={lead.email ?? ""} maxLength={254} /></label>
              <label>Origem<input name="source" defaultValue={lead.source ?? ""} maxLength={120} /></label>
              <label>Valor<input name="value" type="number" min="0" step="0.01" defaultValue={Number(lead.value_in_cents) / 100} /></label>
              <label>Próximo contato<input name="follow_up" type="datetime-local" defaultValue={dateTimeLocal(lead.follow_up_at)} /></label>
              <label className="full-field">Anotações<textarea name="notes" defaultValue={lead.notes ?? ""} maxLength={10000} rows={6} /></label>
              <button type="submit">Salvar alterações</button>
            </form>
          </section>

          <section className="detail-card task-card">
            <div className="section-heading"><div><p className="eyebrow">PRÓXIMAS AÇÕES</p><h2>Tarefas</h2></div><span>{tasks?.filter((task) => !task.completed_at).length ?? 0} pendentes</span></div>
            <form className="task-create-form" action={createLeadTask}>
              <input type="hidden" name="lead_id" value={lead.id} />
              <label>Título*<input name="title" required maxLength={160} placeholder="Ex.: Enviar proposta comercial" /></label>
              <label>Prazo<input name="due_at" type="datetime-local" /></label>
              <label className="full-field">Detalhes<textarea name="description" maxLength={2000} rows={3} placeholder="Informações para executar esta tarefa" /></label>
              <button type="submit">Adicionar tarefa</button>
            </form>
            <div className="task-list">
              {tasks?.length ? tasks.map((task) => {
                const overdue = !task.completed_at && task.due_at && new Date(task.due_at).getTime() < Date.now();
                return <article className={`task-item${task.completed_at ? " completed" : ""}`} key={task.id}>
                  <form action={toggleLeadTask}>
                    <input type="hidden" name="lead_id" value={lead.id} />
                    <input type="hidden" name="task_id" value={task.id} />
                    <input type="hidden" name="version" value={task.version} />
                    <input type="hidden" name="completed" value={task.completed_at ? "false" : "true"} />
                    <button className="task-toggle" type="submit" aria-label={`${task.completed_at ? "Reabrir" : "Concluir"} ${task.title}`}>{task.completed_at ? "✓" : ""}</button>
                  </form>
                  <div><strong>{task.title}</strong>{task.description ? <p>{task.description}</p> : null}{task.due_at ? <time className={overdue ? "overdue" : ""}>{overdue ? "Atrasada · " : "Prazo · "}{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(task.due_at))}</time> : null}</div>
                </article>;
              }) : <p className="empty-state">Nenhuma tarefa cadastrada para este lead.</p>}
            </div>
          </section>

          <aside className="detail-card activity-card">
            <h2>Histórico</h2>
            {events?.length ? <ol>{events.map((event) => <li key={event.id}><i /><div><strong>{eventLabel(event.action)}</strong><time>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(event.created_at))}</time></div></li>)}</ol> : <p>Nenhum evento disponível.</p>}
          </aside>
        </div>
      </div>
    </main>
  );
}
