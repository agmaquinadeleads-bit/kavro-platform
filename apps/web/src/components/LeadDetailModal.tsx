"use client";

import { CSSProperties, FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  assignLeadModal,
  createLeadTaskModal,
  getLeadDetailData,
  toggleLeadTaskModal,
  updateLeadModal,
  type LeadDetailData,
  type LeadDetailTask
} from "@/app/app/modal-actions";

type LeadDetailModalProps = {
  leadId: string | null;
  onClose: () => void;
};

type TabKey = "info" | "tasks" | "history" | "purchases";

// Mesmos textos de erro usados em apps/web/src/app/app/leads/[id]/page.tsx —
// duplicado aqui porque o modal não navega por query params (?error=...),
// então precisa mapear o código de erro pra mensagem localmente.
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

function resolveErrorMessage(code?: string) {
  if (!code) return "Não foi possível concluir a ação.";
  return errorMessages[code] ?? "Não foi possível concluir a ação.";
}

function dateTimeLocal(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 16) : "";
}

function eventLabel(action: string) {
  return (
    {
      "lead.created": "Lead criado",
      "lead.updated": "Informações atualizadas",
      "lead.stage_changed": "Etapa alterada",
      "lead.archived": "Lead arquivado",
      "lead_task.created": "Tarefa criada",
      "lead_task.completed": "Tarefa concluída",
      "lead_task.reopened": "Tarefa reaberta",
      "lead_task.updated": "Tarefa atualizada"
    } as Record<string, string>
  )[action] ?? action;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

function currency(valueInCents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valueInCents / 100);
}

export function LeadDetailModal({ leadId, onClose }: LeadDetailModalProps) {
  const router = useRouter();
  const [data, setData] = useState<LeadDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("info");
  const [formError, setFormError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [assignPending, setAssignPending] = useState(false);
  const [updatePending, setUpdatePending] = useState(false);
  const [taskPending, setTaskPending] = useState(false);
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (!leadId) {
      setData(null);
      setLoading(false);
      setNotFound(false);
      setActiveTab("info");
      setFormError(null);
      setSavedHint(false);
      setHasChanges(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setFormError(null);

    getLeadDetailData(leadId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result) {
        setNotFound(true);
        setData(null);
        return;
      }
      setData(result);
    });

    return () => {
      cancelled = true;
    };
  }, [leadId]);

  const refresh = useCallback(async () => {
    if (!leadId) return;
    const result = await getLeadDetailData(leadId);
    if (result) setData(result);
  }, [leadId]);

  useEffect(() => {
    if (!leadId) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (hasChanges) router.refresh();
      onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [leadId, hasChanges, onClose, router]);

  function handleClose() {
    if (hasChanges) router.refresh();
    onClose();
  }

  function flashSaved() {
    setSavedHint(true);
    window.setTimeout(() => setSavedHint(false), 2000);
  }

  async function handleAssignSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setAssignPending(true);
    const formData = new FormData(event.currentTarget);
    const result = await assignLeadModal(formData);
    setAssignPending(false);
    if (result.success) {
      setHasChanges(true);
      flashSaved();
      await refresh();
    } else {
      setFormError(resolveErrorMessage(result.error));
    }
  }

  async function handleUpdateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setUpdatePending(true);
    const formData = new FormData(event.currentTarget);
    const result = await updateLeadModal(formData);
    setUpdatePending(false);
    if (result.success) {
      setHasChanges(true);
      flashSaved();
      await refresh();
    } else {
      setFormError(resolveErrorMessage(result.error));
    }
  }

  async function handleCreateTaskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setTaskPending(true);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const result = await createLeadTaskModal(formData);
    setTaskPending(false);
    if (result.success) {
      setHasChanges(true);
      flashSaved();
      form.reset();
      await refresh();
    } else {
      setFormError(resolveErrorMessage(result.error));
    }
  }

  async function handleToggleTask(task: LeadDetailTask) {
    if (!leadId) return;
    setFormError(null);
    setTogglingTaskId(task.id);
    const formData = new FormData();
    formData.set("lead_id", leadId);
    formData.set("task_id", task.id);
    formData.set("version", String(task.version));
    formData.set("completed", task.completed_at ? "false" : "true");
    const result = await toggleLeadTaskModal(formData);
    setTogglingTaskId(null);
    if (result.success) {
      setHasChanges(true);
      await refresh();
    } else {
      setFormError(resolveErrorMessage(result.error));
    }
  }

  if (!leadId) return null;

  const overlayStyle: CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "20px"
  };

  const cardStyle: CSSProperties = {
    backgroundColor: "var(--surface)",
    borderRadius: "8px",
    border: "1px solid var(--line)",
    maxWidth: "760px",
    width: "100%",
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
    animation: "modalIn 0.2s ease-out"
  };

  const headerStyle: CSSProperties = {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "16px",
    padding: "24px 24px 0 24px"
  };

  const titleStyle: CSSProperties = {
    fontSize: "20px",
    fontWeight: 600,
    color: "var(--ink)",
    margin: "0 0 8px 0"
  };

  const closeButtonStyle: CSSProperties = {
    width: "32px",
    height: "32px",
    display: "grid",
    placeItems: "center",
    border: "1px solid var(--line)",
    borderRadius: "6px",
    backgroundColor: "var(--surface)",
    color: "var(--muted)",
    fontSize: "16px",
    cursor: "pointer",
    flexShrink: 0
  };

  const tabsRowStyle: CSSProperties = {
    display: "flex",
    gap: "4px",
    padding: "16px 24px 0 24px",
    borderBottom: "1px solid var(--line)"
  };

  function tabButtonStyle(tab: TabKey): CSSProperties {
    const active = activeTab === tab;
    return {
      padding: "8px 14px",
      fontSize: "13px",
      fontWeight: 600,
      color: active ? "var(--primary)" : "var(--muted)",
      background: "none",
      border: "none",
      borderBottom: active ? "2px solid var(--primary)" : "2px solid transparent",
      cursor: "pointer",
      marginBottom: "-1px"
    };
  }

  const bodyStyle: CSSProperties = {
    padding: "20px 24px 24px 24px",
    overflowY: "auto",
    flex: 1,
    minHeight: 0
  };

  const savedHintStyle: CSSProperties = {
    color: "#22764d",
    fontSize: "12px",
    fontWeight: 600
  };

  const statusLabel = data ? (data.lead.status === "won" ? "Fechado" : data.lead.status === "lost" ? "Perdido" : "Em andamento") : "";

  return (
    <div style={overlayStyle} onClick={handleClose} role="presentation">
      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
      <div style={cardStyle} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Detalhes do lead">
        <div style={headerStyle}>
          <div>
            <h2 style={titleStyle}>{data ? data.lead.name : "Detalhes do lead"}</h2>
            {data ? <span className={`status-badge ${data.lead.status}`}>{statusLabel}</span> : null}
          </div>
          <button type="button" style={closeButtonStyle} onClick={handleClose} aria-label="Fechar">×</button>
        </div>

        {data ? (
          <div style={tabsRowStyle} role="tablist">
            <button type="button" role="tab" aria-selected={activeTab === "info"} style={tabButtonStyle("info")} onClick={() => setActiveTab("info")}>Informações</button>
            <button type="button" role="tab" aria-selected={activeTab === "tasks"} style={tabButtonStyle("tasks")} onClick={() => setActiveTab("tasks")}>Tarefas</button>
            <button type="button" role="tab" aria-selected={activeTab === "history"} style={tabButtonStyle("history")} onClick={() => setActiveTab("history")}>Histórico</button>
            {data.purchases.length > 0 ? (
              <button type="button" role="tab" aria-selected={activeTab === "purchases"} style={tabButtonStyle("purchases")} onClick={() => setActiveTab("purchases")}>Compras</button>
            ) : null}
          </div>
        ) : null}

        <div style={bodyStyle}>
          {loading ? <p className="empty-state">Carregando...</p> : null}
          {!loading && notFound ? <p className="empty-state">Não foi possível carregar este lead.</p> : null}

          {!loading && data ? (
            <>
              {formError ? <div className="feedback error" role="alert">{formError}</div> : null}
              {savedHint ? <p style={savedHintStyle}>Salvo.</p> : null}

              {activeTab === "info" ? (
                <>
                  <form key={`assign-${data.lead.version}`} className="assignment-form" onSubmit={handleAssignSubmit}>
                    <input type="hidden" name="lead_id" value={data.lead.id} />
                    <input type="hidden" name="version" value={data.lead.version} />
                    <label>
                      Responsável
                      <select name="owner_id" defaultValue={data.lead.owner_id ?? ""}>
                        <option value="">Sem responsável</option>
                        {data.members.map((member) => (
                          <option key={member.user_id} value={member.user_id}>
                            {member.full_name || member.email || "Membro da equipe"} · {member.role}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" disabled={assignPending}>{assignPending ? "Atribuindo..." : "Atribuir"}</button>
                  </form>

                  <form key={`edit-${data.lead.version}`} className="lead-edit-form" onSubmit={handleUpdateSubmit}>
                    <input type="hidden" name="lead_id" value={data.lead.id} />
                    <input type="hidden" name="version" value={data.lead.version} />
                    <label>Nome*<input name="name" defaultValue={data.lead.name} required maxLength={160} /></label>
                    <label>Telefone<input name="phone" defaultValue={data.lead.phone ?? ""} maxLength={32} /></label>
                    <label>E-mail<input name="email" type="email" defaultValue={data.lead.email ?? ""} maxLength={254} /></label>
                    <label>Origem<input name="source" defaultValue={data.lead.source ?? ""} maxLength={120} /></label>
                    <label>Valor<input name="value" type="number" min="0" step="0.01" defaultValue={Number(data.lead.value_in_cents) / 100} /></label>
                    <label>Próximo contato<input name="follow_up" type="datetime-local" defaultValue={dateTimeLocal(data.lead.follow_up_at)} /></label>
                    <label className="full-field">Anotações<textarea name="notes" defaultValue={data.lead.notes ?? ""} maxLength={10000} rows={6} /></label>
                    <button type="submit" disabled={updatePending}>{updatePending ? "Salvando..." : "Salvar alterações"}</button>
                  </form>
                </>
              ) : null}

              {activeTab === "tasks" ? (
                <>
                  <form className="task-create-form" onSubmit={handleCreateTaskSubmit}>
                    <input type="hidden" name="lead_id" value={data.lead.id} />
                    <label>Título*<input name="title" required maxLength={160} placeholder="Ex.: Enviar proposta comercial" /></label>
                    <label>Prazo<input name="due_at" type="datetime-local" /></label>
                    <label className="full-field">Detalhes<textarea name="description" maxLength={2000} rows={3} placeholder="Informações para executar esta tarefa" /></label>
                    <button type="submit" disabled={taskPending}>{taskPending ? "Adicionando..." : "Adicionar tarefa"}</button>
                  </form>
                  <div className="task-list">
                    {data.tasks.length ? (
                      data.tasks.map((task) => {
                        const overdue = !task.completed_at && task.due_at && new Date(task.due_at).getTime() < Date.now();
                        return (
                          <article className={`task-item${task.completed_at ? " completed" : ""}`} key={task.id}>
                            <button
                              className="task-toggle"
                              type="button"
                              disabled={togglingTaskId === task.id}
                              aria-label={`${task.completed_at ? "Reabrir" : "Concluir"} ${task.title}`}
                              onClick={() => handleToggleTask(task)}
                            >
                              {task.completed_at ? "✓" : ""}
                            </button>
                            <div>
                              <strong>{task.title}</strong>
                              {task.description ? <p>{task.description}</p> : null}
                              {task.due_at ? (
                                <time className={overdue ? "overdue" : ""}>
                                  {overdue ? "Atrasada · " : "Prazo · "}
                                  {formatDateTime(task.due_at)}
                                </time>
                              ) : null}
                            </div>
                          </article>
                        );
                      })
                    ) : (
                      <p className="empty-state">Nenhuma tarefa cadastrada para este lead.</p>
                    )}
                  </div>
                </>
              ) : null}

              {activeTab === "history" ? (
                <div className="activity-card">
                  {data.events.length ? (
                    <ol>
                      {data.events.map((event) => (
                        <li key={event.id}>
                          <i />
                          <div>
                            <strong>{eventLabel(event.action)}</strong>
                            <time>{formatDateTime(event.created_at)}</time>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>Nenhum evento disponível.</p>
                  )}
                </div>
              ) : null}

              {activeTab === "purchases" ? (
                <div className="purchase-history">
                  <div className="purchase-summary">
                    <div>
                      <span>Total gasto</span>
                      <strong>{currency(data.purchases.reduce((sum, purchase) => sum + purchase.value_in_cents, 0))}</strong>
                    </div>
                    <div>
                      <span>Compras</span>
                      <strong>{data.purchases.length}</strong>
                    </div>
                  </div>
                  <ol className="purchase-list">
                    {data.purchases.map((purchase) => (
                      <li key={purchase.id} className="purchase-item">
                        <div>
                          <strong>{purchase.product}</strong>
                          <time>{formatDateTime(purchase.purchased_at)}</time>
                        </div>
                        <span>{currency(purchase.value_in_cents)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
