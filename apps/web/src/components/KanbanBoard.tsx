"use client";

import { CSSProperties, useState } from "react";
import Link from "next/link";
import { archiveLead, moveLead } from "@/app/app/actions";
import { MoveLeadForm } from "@/components/move-lead-form";
import type { DashboardLead, DashboardStage } from "@/components/dashboard";

function currency(valueInCents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valueInCents / 100);
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

type KanbanBoardProps = {
  stages: DashboardStage[];
  leads: DashboardLead[];
};

export function KanbanBoard({ stages, leads }: KanbanBoardProps) {
  const [draggedLead, setDraggedLead] = useState<DraggedLead | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [pendingLossMove, setPendingLossMove] = useState<PendingLossMove | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  async function submitMove(leadId: string, stageId: string, version: number, lossReason: string) {
    setIsMoving(true);
    try {
      const fd = new FormData();
      fd.set("lead_id", leadId);
      fd.set("stage_id", stageId);
      fd.set("version", String(version));
      fd.set("loss_reason", lossReason ?? "");
      // moveLead é uma server action que faz redirect() internamente — esse é
      // o comportamento esperado (Next.js intercepta e navega). Não capturar
      // nem silenciar o erro especial de redirecionamento aqui.
      await moveLead(fd);
    } finally {
      setIsMoving(false);
    }
  }

  function handleDrop(targetStage: DashboardStage) {
    if (!draggedLead || isMoving) return;
    if (draggedLead.stageId === targetStage.id) {
      setDraggedLead(null);
      setDragOverStageId(null);
      return;
    }

    if (targetStage.isLost) {
      const lead = leads.find((item) => item.id === draggedLead.leadId);
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

    const { leadId, version } = draggedLead;
    setDraggedLead(null);
    setDragOverStageId(null);
    void submitMove(leadId, targetStage.id, version, "");
  }

  return (
    <section className="kanban real-kanban" aria-label="Pipeline">
      {stages.map((stage) => {
        const stageLeads = leads.filter((lead) => lead.stageId === stage.id);
        return (
          <div
            className={`column${dragOverStageId === stage.id ? " drag-over" : ""}`}
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
            <header><div><i className={stage.isWon ? "green" : stage.isLost ? "red" : "blue"} /><strong>{stage.name}</strong><span>{stageLeads.length}</span></div></header>
            <p>{currency(stageLeads.reduce((sum, lead) => sum + lead.valueInCents, 0))}</p>
            <div className="card-list">
              {stageLeads.map((lead) => (
                <article
                  className={`deal-card${draggedLead?.leadId === lead.id ? " dragging" : ""}`}
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
                  <h3><Link href={`/app/leads/${lead.id}`}>{lead.name}</Link></h3>
                  <strong>{currency(lead.valueInCents)}</strong>
                  <p className="lead-contact">{lead.phone || lead.email || "Contato não informado"}</p>
                  {followUpState(lead.followUpAt) ? <span className={`followup-badge ${followUpState(lead.followUpAt)?.kind}`}>{followUpState(lead.followUpAt)?.label}</span> : null}
                  <MoveLeadForm leadId={lead.id} leadName={lead.name} version={lead.version} currentStageId={stage.id} stages={stages} />
                  <form action={archiveLead}><input type="hidden" name="lead_id" value={lead.id} /><input type="hidden" name="version" value={lead.version} /><button className="archive-button" type="submit" aria-label={`Arquivar ${lead.name}`}>Arquivar</button></form>
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
            void submitMove(leadId, stageId, version, reason);
          }}
        />
      ) : null}
    </section>
  );
}
