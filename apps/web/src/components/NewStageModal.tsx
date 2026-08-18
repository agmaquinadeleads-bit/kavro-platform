"use client";

import { CSSProperties } from "react";
import { createStage } from "@/app/app/actions";

interface NewStageModalProps {
  isOpen: boolean;
  onClose: () => void;
  pipelineId: string;
}

export function NewStageModal({ isOpen, onClose, pipelineId }: NewStageModalProps) {
  if (!isOpen) return null;

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
    padding: "32px",
    maxWidth: "440px",
    width: "90%",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)"
  };

  const titleStyle: CSSProperties = {
    fontSize: "18px",
    fontWeight: 600,
    color: "var(--ink)",
    margin: 0
  };

  const subtitleStyle: CSSProperties = {
    fontSize: "14px",
    color: "var(--muted)",
    lineHeight: "1.5",
    margin: "8px 0 24px 0"
  };

  const formStyle: CSSProperties = {
    display: "grid",
    gap: "14px"
  };

  const labelStyle: CSSProperties = {
    display: "grid",
    gap: "6px",
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--ink)"
  };

  const checkboxLabelStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: "13px",
    fontWeight: 500,
    color: "var(--ink)"
  };

  const inputStyle: CSSProperties = {
    height: "42px",
    padding: "0 12px",
    borderRadius: "6px",
    border: "1px solid var(--line)",
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
    fontSize: "14px"
  };

  const buttonsStyle: CSSProperties = {
    display: "flex",
    gap: "12px",
    justifyContent: "flex-end",
    marginTop: "24px"
  };

  const cancelButtonStyle: CSSProperties = {
    padding: "8px 16px",
    fontSize: "14px",
    fontWeight: 500,
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
    border: "1px solid var(--line)",
    borderRadius: "4px",
    cursor: "pointer",
    transition: "background-color 0.15s ease"
  };

  const submitButtonStyle: CSSProperties = {
    padding: "8px 16px",
    fontSize: "14px",
    fontWeight: 500,
    backgroundColor: "var(--primary)",
    color: "white",
    border: "1px solid var(--primary)",
    borderRadius: "4px",
    cursor: "pointer",
    transition: "background-color 0.15s ease"
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <div style={overlayStyle} onClick={handleCancel}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={titleStyle}>Nova etapa</h2>
        <p style={subtitleStyle}>Adicione uma nova etapa ao pipeline.</p>

        <form action={createStage} style={formStyle}>
          <input type="hidden" name="pipeline_id" value={pipelineId} />
          <label style={labelStyle}>
            Nome*
            <input
              style={inputStyle}
              name="name"
              required
              maxLength={100}
              placeholder="Ex: Qualificação"
            />
          </label>

          <label style={labelStyle}>
            Tipo
            <select style={inputStyle} name="kind" defaultValue="open">
              <option value="open">Em andamento</option>
              <option value="won">Fechamento</option>
              <option value="lost">Perda</option>
            </select>
          </label>

          <label style={checkboxLabelStyle}>
            <input type="checkbox" name="requires_proposal" />
            Exigir produto/serviço e valor da proposta ao entrar nessa etapa
          </label>

          <div style={buttonsStyle}>
            <button
              type="button"
              style={cancelButtonStyle}
              onClick={handleCancel}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--hover)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--surface)";
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              style={submitButtonStyle}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--primary-dark)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--primary)";
              }}
            >
              Criar etapa
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
