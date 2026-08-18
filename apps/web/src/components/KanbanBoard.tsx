"use client";

import { CSSProperties, useEffect, useState } from "react";
import { deleteStage, moveLead, moveStagePosition, renameStage } from "@/app/app/actions";
import { ConfirmModal } from "@/components/ConfirmModal";
import { LeadDetailModal } from "./LeadDetailModal";
import type { DashboardLead, DashboardStage } from "@/components/dashboard";

function currency(valueInCents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valueInCents / 100);
}

function arrivalDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

function followUpState(value: string | null) {
  if (!value) return null;
  const target = new Date(value);
  const now = new Date();
  const formatDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
  if (target.getTime() < now.getTime()) return { kind: "overdue", label: "Follow-up vencido" };
  if (formatDay.format(target) === formatDay.format(now)) return { kind: "today", label: "Follow-up hoje" };
  return { kind: "future", label: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(target) };
}

type DraggedLead = { leadId: string; version: number; stageId: string };

type PendingLossMove = { leadId: string; leadName: string; version: number; stageId: string };

type PendingWonMove = { leadId: string; leadName: string; version: number; stageId: string };

type PendingProposalMove = { leadId: string; leadName: string; version: number; stageId: string };

type LossReasonPromptProps = {
  leadName: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

function LossReasonPrompt({ leadName, onCancel, onConfirm }: LossReasonPromptProps) {
  const [reason, setReason] = useState("");

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
    zIndex: 1000
  };

  const modalStyle: CSSProperties = {
    backgroundColor: "var(--surface)",
    borderRadius: "8px",
    border: "1px solid var(--line)",
    padding: "24px",
    maxWidth: "360px",
    width: "90%",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)"
  };

  const titleStyle: CSSProperties = {
    fontSize: "16px",
    fontWeight: 600,
    color: "var(--ink)",
    margin: "0 0 12px 0"
  };

  const inputStyle: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    height: "38px",
    border: "1px solid var(--line)",
    borderRadius: "7px",
    padding: "0 10px",
    fontSize: "13px",
    color: "var(--ink)",
    marginBottom: "16px"
  };

  const buttonsStyle: CSSProperties = {
    display: "flex",
    gap: "10px",
    justifyContent: "flex-end"
  };

  const cancelButtonStyle: CSSProperties = {
    padding: "8px 16px",
    fontSize: "13px",
    fontWeight: 500,
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
    border: "1px solid var(--line)",
    borderRadius: "6px",
    cursor: "pointer"
  };

  const confirmButtonStyle: CSSProperties = {
    padding: "8px 16px",
    fontSize: "13px",
    fontWeight: 500,
    backgroundColor: reason.trim() ? "var(--primary)" : "var(--muted)",
    color: "white",
    border: "1px solid transparent",
    borderRadius: "6px",
    cursor: reason.trim() ? "pointer" : "not-allowed",
    opacity: reason.trim() ? 1 : 0.7
  };

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={(event) => event.stopPropagation()}>
        <h2 style={titleStyle}>Por que essa oportunidade foi perdida?</h2>
        <input
          type="text"
          required
          maxLength={160}
          autoFocus
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Motivo da perda"
          aria-label={`Motivo de perda de ${leadName}`}
          style={inputStyle}
        />
        <div style={buttonsStyle}>
          <button type="button" style={cancelButtonStyle} onClick={onCancel}>Cancelar</button>
          <button
            type="button"
            style={confirmButtonStyle}
            disabled={!reason.trim()}
            onClick={() => {
              if (reason.trim()) onConfirm(reason.trim());
            }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

type WonProductPromptProps = {
  leadName: string;
  onCancel: () => void;
  onConfirm: (product: string) => void;
};

function WonProductPrompt({ leadName, onCancel, onConfirm }: WonProductPromptProps) {
  const [product, setProduct] = useState("");

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
    zIndex: 1000
  };

  const modalStyle: CSSProperties = {
    backgroundColor: "var(--surface)",
    borderRadius: "8px",
    border: "1px solid var(--line)",
    padding: "24px",
    maxWidth: "360px",
    width: "90%",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)"
  };

  const titleStyle: CSSProperties = {
    fontSize: "16px",
    fontWeight: 600,
    color: "var(--ink)",
    margin: "0 0 12px 0"
  };

  const inputStyle: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    height: "38px",
    border: "1px solid var(--line)",
    borderRadius: "7px",
    padding: "0 10px",
    fontSize: "13px",
    color: "var(--ink)",
    marginBottom: "16px"
  };

  const buttonsStyle: CSSProperties = {
    display: "flex",
    gap: "10px",
    justifyContent: "flex-end"
  };

  const cancelButtonStyle: CSSProperties = {
    padding: "8px 16px",
    fontSize: "13px",
    fontWeight: 500,
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
    border: "1px solid var(--line)",
    borderRadius: "6px",
    cursor: "pointer"
  };

  const confirmButtonStyle: CSSProperties = {
    padding: "8px 16px",
    fontSize: "13px",
    fontWeight: 500,
    backgroundColor: product.trim() ? "var(--primary)" : "var(--muted)",
    color: "white",
    border: "1px solid transparent",
    borderRadius: "6px",
    cursor: product.trim() ? "pointer" : "not-allowed",
    opacity: product.trim() ? 1 : 0.7
  };

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={(event) => event.stopPropagation()}>
        <h2 style={titleStyle}>Qual produto foi vendido?</h2>
        <input
          type="text"
          required
          maxLength={160}
          autoFocus
          value={product}
          onChange={(event) => setProduct(event.target.value)}
          placeholder="Produto vendido"
          aria-label={`Produto vendido para ${leadName}`}
          style={inputStyle}
        />
        <div style={buttonsStyle}>
          <button type="button" style={cancelButtonStyle} onClick={onCancel}>Cancelar</button>
          <button
            type="button"
            style={confirmButtonStyle}
            disabled={!product.trim()}
            onClick={() => {
              if (product.trim()) onConfirm(product.trim());
            }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

type ProposalPromptProps = {
  leadName: string;
  onCancel: () => void;
  onConfirm: (product: string, valueInReais: string) => void;
};

// Mesmo padrão visual do WonProductPrompt acima, com um segundo campo pro
// valor da proposta — pedido do usuário pra etapas tipo "Proposta
// apresentada": exige produto/serviço E valor antes do lead entrar nelas
// (pipeline_stages.requires_proposal, validado também no trigger do banco).
function ProposalPrompt({ leadName, onCancel, onConfirm }: ProposalPromptProps) {
  const [product, setProduct] = useState("");
  const [value, setValue] = useState("");
  const canConfirm = product.trim().length > 0 && Number(value) > 0;

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
    zIndex: 1000
  };

  const modalStyle: CSSProperties = {
    backgroundColor: "var(--surface)",
    borderRadius: "8px",
    border: "1px solid var(--line)",
    padding: "24px",
    maxWidth: "360px",
    width: "90%",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)"
  };

  const titleStyle: CSSProperties = {
    fontSize: "16px",
    fontWeight: 600,
    color: "var(--ink)",
    margin: "0 0 12px 0"
  };

  const labelStyle: CSSProperties = {
    display: "block",
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--muted)",
    margin: "0 0 5px 0"
  };

  const inputStyle: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    height: "38px",
    border: "1px solid var(--line)",
    borderRadius: "7px",
    padding: "0 10px",
    fontSize: "13px",
    color: "var(--ink)",
    marginBottom: "14px"
  };

  const buttonsStyle: CSSProperties = {
    display: "flex",
    gap: "10px",
    justifyContent: "flex-end"
  };

  const cancelButtonStyle: CSSProperties = {
    padding: "8px 16px",
    fontSize: "13px",
    fontWeight: 500,
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
    border: "1px solid var(--line)",
    borderRadius: "6px",
    cursor: "pointer"
  };

  const confirmButtonStyle: CSSProperties = {
    padding: "8px 16px",
    fontSize: "13px",
    fontWeight: 500,
    backgroundColor: canConfirm ? "var(--primary)" : "var(--muted)",
    color: "white",
    border: "1px solid transparent",
    borderRadius: "6px",
    cursor: canConfirm ? "pointer" : "not-allowed",
    opacity: canConfirm ? 1 : 0.7
  };

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={(event) => event.stopPropagation()}>
        <h2 style={titleStyle}>Qual proposta foi apresentada?</h2>
        <label style={labelStyle}>Produto/serviço</label>
        <input
          type="text"
          required
          maxLength={160}
          autoFocus
          value={product}
          onChange={(event) => setProduct(event.target.value)}
          placeholder="Ex: Plano anual"
          aria-label={`Produto ou serviço proposto para ${leadName}`}
          style={inputStyle}
        />
        <label style={labelStyle}>Valor (R$)</label>
        <input
          type="number"
          required
          min="0.01"
          step="0.01"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="0,00"
          aria-label={`Valor da proposta para ${leadName}`}
          style={inputStyle}
        />
        <div style={buttonsStyle}>
          <button type="button" style={cancelButtonStyle} onClick={onCancel}>Cancelar</button>
          <button
            type="button"
            style={confirmButtonStyle}
            disabled={!canConfirm}
            onClick={() => {
              if (canConfirm) onConfirm(product.trim(), value);
            }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

type RenameStagePromptProps = {
  stage: DashboardStage;
  onCancel: () => void;
};

function RenameStagePrompt({ stage, onCancel }: RenameStagePromptProps) {
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
    zIndex: 1000
  };

  const modalStyle: CSSProperties = {
    backgroundColor: "var(--surface)",
    borderRadius: "8px",
    border: "1px solid var(--line)",
    padding: "24px",
    maxWidth: "360px",
    width: "90%",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)"
  };

  const titleStyle: CSSProperties = {
    fontSize: "16px",
    fontWeight: 600,
    color: "var(--ink)",
    margin: "0 0 12px 0"
  };

  const inputStyle: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    height: "38px",
    border: "1px solid var(--line)",
    borderRadius: "7px",
    padding: "0 10px",
    fontSize: "13px",
    color: "var(--ink)",
    marginBottom: "16px"
  };

  const buttonsStyle: CSSProperties = {
    display: "flex",
    gap: "10px",
    justifyContent: "flex-end"
  };

  const cancelButtonStyle: CSSProperties = {
    padding: "8px 16px",
    fontSize: "13px",
    fontWeight: 500,
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
    border: "1px solid var(--line)",
    borderRadius: "6px",
    cursor: "pointer"
  };

  const confirmButtonStyle: CSSProperties = {
    padding: "8px 16px",
    fontSize: "13px",
    fontWeight: 500,
    backgroundColor: "var(--primary)",
    color: "white",
    border: "1px solid transparent",
    borderRadius: "6px",
    cursor: "pointer"
  };

  const checkboxLabelStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "12px",
    fontWeight: 500,
    color: "var(--ink)",
    marginBottom: "16px"
  };

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={(event) => event.stopPropagation()}>
        <h2 style={titleStyle}>Renomear etapa</h2>
        <form action={renameStage}>
          <input type="hidden" name="stage_id" value={stage.id} />
          <input
            type="text"
            name="name"
            required
            maxLength={100}
            autoFocus
            defaultValue={stage.name}
            aria-label="Novo nome da etapa"
            style={inputStyle}
          />
          <label style={checkboxLabelStyle}>
            <input type="checkbox" name="requires_proposal" defaultChecked={stage.requiresProposal} />
            Exigir produto/serviço e valor da proposta ao entrar nessa etapa
          </label>
          <div style={buttonsStyle}>
            <button type="button" style={cancelButtonStyle} onClick={onCancel}>Cancelar</button>
            <button type="submit" style={confirmButtonStyle}>Salvar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

type KanbanBoardProps = {
  stages: DashboardStage[];
  leads: DashboardLead[];
};

export function KanbanBoard({ stages, leads }: KanbanBoardProps) {
  // Estado local otimista: mover um lead via drag-and-drop precisa parecer
  // instantâneo. moveLead() faz redirect() (refaz a página inteira no
  // servidor), então sem isso o card só troca de coluna depois do
  // round-trip completo. Aqui a UI já reflete o novo estágio na hora do
  // drop; quando a resposta do servidor chega (via redirect/revalidate),
  // o efeito abaixo resincroniza com os dados reais.
  const [localLeads, setLocalLeads] = useState(leads);
  useEffect(() => {
    setLocalLeads(leads);
  }, [leads]);

  const [draggedLead, setDraggedLead] = useState<DraggedLead | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [pendingLossMove, setPendingLossMove] = useState<PendingLossMove | null>(null);
  const [pendingWonMove, setPendingWonMove] = useState<PendingWonMove | null>(null);
  const [pendingProposalMove, setPendingProposalMove] = useState<PendingProposalMove | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [openMenuStageId, setOpenMenuStageId] = useState<string | null>(null);
  const [stageToDelete, setStageToDelete] = useState<DashboardStage | null>(null);
  const [isDeletingStage, setIsDeletingStage] = useState(false);
  const [stageToRename, setStageToRename] = useState<DashboardStage | null>(null);

  // Fecha o menu de coluna aberto ao clicar em qualquer lugar fora dele.
  useEffect(() => {
    if (!openMenuStageId) return;
    function handleClickOutside() {
      setOpenMenuStageId(null);
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [openMenuStageId]);

  async function submitMoveStage(stageId: string, direction: "left" | "right") {
    const fd = new FormData();
    fd.set("stage_id", stageId);
    fd.set("direction", direction);
    // moveStagePosition é uma server action que faz redirect() internamente —
    // mesmo comportamento esperado que moveLead. Não capturar nem silenciar o
    // erro especial de redirecionamento aqui.
    await moveStagePosition(fd);
  }

  async function submitDeleteStage(stageId: string) {
    setIsDeletingStage(true);
    try {
      const fd = new FormData();
      fd.set("stage_id", stageId);
      // deleteStage também faz redirect() internamente — mesmo padrão acima.
      await deleteStage(fd);
    } finally {
      setIsDeletingStage(false);
    }
  }

  async function submitMove(leadId: string, stageId: string, version: number, lossReason: string, wonProduct: string = "", proposalProduct: string = "", proposalValue: string = "") {
    setIsMoving(true);
    try {
      const fd = new FormData();
      fd.set("lead_id", leadId);
      fd.set("stage_id", stageId);
      fd.set("version", String(version));
      fd.set("loss_reason", lossReason ?? "");
      fd.set("won_product", wonProduct ?? "");
      fd.set("proposal_product", proposalProduct ?? "");
      fd.set("proposal_value", proposalValue ?? "");
      // moveLead é uma server action que faz redirect() internamente — esse é
      // o comportamento esperado (Next.js intercepta e navega). Não capturar
      // nem silenciar o erro especial de redirecionamento aqui.
      await moveLead(fd);
    } finally {
      setIsMoving(false);
    }
  }

  function moveLeadLocally(leadId: string, stageId: string) {
    setLocalLeads((current) => current.map((lead) => (lead.id === leadId ? { ...lead, stageId } : lead)));
  }

  function handleDrop(targetStage: DashboardStage) {
    if (!draggedLead || isMoving) return;
    if (draggedLead.stageId === targetStage.id) {
      setDraggedLead(null);
      setDragOverStageId(null);
      return;
    }

    if (targetStage.isLost) {
      const lead = localLeads.find((item) => item.id === draggedLead.leadId);
      setPendingLossMove({
        leadId: draggedLead.leadId,
        leadName: lead?.name ?? "",
        version: draggedLead.version,
        stageId: targetStage.id
      });
      setDraggedLead(null);
      setDragOverStageId(null);
      return;
    }

    if (targetStage.isWon) {
      const lead = localLeads.find((item) => item.id === draggedLead.leadId);
      setPendingWonMove({
        leadId: draggedLead.leadId,
        leadName: lead?.name ?? "",
        version: draggedLead.version,
        stageId: targetStage.id
      });
      setDraggedLead(null);
      setDragOverStageId(null);
      return;
    }

    if (targetStage.requiresProposal) {
      const lead = localLeads.find((item) => item.id === draggedLead.leadId);
      setPendingProposalMove({
        leadId: draggedLead.leadId,
        leadName: lead?.name ?? "",
        version: draggedLead.version,
        stageId: targetStage.id
      });
      setDraggedLead(null);
      setDragOverStageId(null);
      return;
    }

    const { leadId, version } = draggedLead;
    setDraggedLead(null);
    setDragOverStageId(null);
    moveLeadLocally(leadId, targetStage.id);
    void submitMove(leadId, targetStage.id, version, "");
  }

  return (
    <section className="kanban real-kanban" aria-label="Pipeline">
      {stages.map((stage, stageIndex) => {
        const stageLeads = localLeads.filter((lead) => lead.stageId === stage.id);
        return (
          <div
            className={`column${dragOverStageId === stage.id ? " drag-over" : ""}${stage.isLost ? " column-loss" : ""}`}
            key={stage.id}
            onDragOver={(event: React.DragEvent<HTMLDivElement>) => {
              event.preventDefault();
              if (draggedLead && draggedLead.stageId !== stage.id) setDragOverStageId(stage.id);
            }}
            onDragLeave={() => {
              setDragOverStageId((current) => (current === stage.id ? null : current));
            }}
            onDrop={(event: React.DragEvent<HTMLDivElement>) => {
              event.preventDefault();
              handleDrop(stage);
            }}
          >
            <header>
              <div><i className={stage.isWon ? "green" : stage.isLost ? "red" : "blue"} /><strong>{stage.name}</strong><span>{stageLeads.length}</span></div>
              <div className="col-menu">
                <button
                  type="button"
                  className="col-menu-btn"
                  aria-label={`Opções da etapa ${stage.name}`}
                  aria-haspopup="true"
                  aria-expanded={openMenuStageId === stage.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenMenuStageId((current) => (current === stage.id ? null : stage.id));
                  }}
                >
                  ⋮
                </button>
                {openMenuStageId === stage.id ? (
                  <div className="col-menu-dropdown" role="menu" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      className="col-menu-item"
                      role="menuitem"
                      disabled={stageIndex === 0}
                      onClick={() => {
                        setOpenMenuStageId(null);
                        void submitMoveStage(stage.id, "left");
                      }}
                    >
                      ← Mover esquerda
                    </button>
                    <button
                      type="button"
                      className="col-menu-item"
                      role="menuitem"
                      disabled={stageIndex === stages.length - 1}
                      onClick={() => {
                        setOpenMenuStageId(null);
                        void submitMoveStage(stage.id, "right");
                      }}
                    >
                      → Mover direita
                    </button>
                    <button
                      type="button"
                      className="col-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setOpenMenuStageId(null);
                        setStageToRename(stage);
                      }}
                    >
                      Renomear etapa
                    </button>
                    <hr className="col-menu-divider" />
                    <button
                      type="button"
                      className="col-menu-item col-menu-item-danger"
                      role="menuitem"
                      onClick={() => {
                        setOpenMenuStageId(null);
                        setStageToDelete(stage);
                      }}
                    >
                      Excluir etapa
                    </button>
                  </div>
                ) : null}
              </div>
            </header>
            <p>{currency(stageLeads.reduce((sum, lead) => sum + lead.valueInCents, 0))}</p>
            <div className="card-list">
              {stageLeads.map((lead) => (
                <article
                  className={`deal-card${draggedLead?.leadId === lead.id ? " dragging" : ""}${followUpState(lead.followUpAt)?.kind === "overdue" ? " overdue-card" : ""}`}
                  key={lead.id}
                  draggable
                  onDragStart={(event: React.DragEvent<HTMLElement>) => {
                    if (isMoving) {
                      event.preventDefault();
                      return;
                    }
                    // setData é dispensável para o estado (guardado via useState),
                    // mas alguns navegadores (ex.: Firefox) exigem a chamada para
                    // iniciar o gesto de arrastar.
                    event.dataTransfer.setData("text/plain", lead.id);
                    event.dataTransfer.effectAllowed = "move";
                    setDraggedLead({ leadId: lead.id, version: lead.version, stageId: stage.id });
                  }}
                  onDragEnd={() => {
                    setDraggedLead(null);
                    setDragOverStageId(null);
                  }}
                >
                  <div className="deal-type">{lead.source || "SEM ORIGEM"}</div>
                  <h3>
                    <button
                      type="button"
                      className="lead-name-link"
                      style={{ background: "none", border: 0, padding: 0, margin: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left" }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedLeadId(lead.id);
                      }}
                    >
                      {lead.name}
                    </button>
                  </h3>
                  <time className="deal-card-date">{arrivalDate(lead.createdAt)}</time>
                </article>
              ))}
            </div>
          </div>
        );
      })}

      {pendingLossMove ? (
        <LossReasonPrompt
          leadName={pendingLossMove.leadName}
          onCancel={() => setPendingLossMove(null)}
          onConfirm={(reason) => {
            const { leadId, stageId, version } = pendingLossMove;
            setPendingLossMove(null);
            moveLeadLocally(leadId, stageId);
            void submitMove(leadId, stageId, version, reason);
          }}
        />
      ) : null}

      {pendingWonMove ? (
        <WonProductPrompt
          leadName={pendingWonMove.leadName}
          onCancel={() => setPendingWonMove(null)}
          onConfirm={(product) => {
            const { leadId, stageId, version } = pendingWonMove;
            setPendingWonMove(null);
            moveLeadLocally(leadId, stageId);
            void submitMove(leadId, stageId, version, "", product);
          }}
        />
      ) : null}

      {pendingProposalMove ? (
        <ProposalPrompt
          leadName={pendingProposalMove.leadName}
          onCancel={() => setPendingProposalMove(null)}
          onConfirm={(product, value) => {
            const { leadId, stageId, version } = pendingProposalMove;
            setPendingProposalMove(null);
            moveLeadLocally(leadId, stageId);
            void submitMove(leadId, stageId, version, "", "", product, value);
          }}
        />
      ) : null}

      <LeadDetailModal leadId={selectedLeadId} onClose={() => setSelectedLeadId(null)} />

      <ConfirmModal
        isOpen={stageToDelete !== null}
        title="Excluir etapa"
        message={`Tem certeza que deseja excluir a etapa "${stageToDelete?.name ?? ""}"? Essa ação não pode ser desfeita.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        isDangerous
        isLoading={isDeletingStage}
        onCancel={() => setStageToDelete(null)}
        onConfirm={() => {
          if (!stageToDelete) return;
          const stageId = stageToDelete.id;
          setStageToDelete(null);
          void submitDeleteStage(stageId);
        }}
      />

      {stageToRename ? (
        <RenameStagePrompt stage={stageToRename} onCancel={() => setStageToRename(null)} />
      ) : null}
    </section>
  );
}
