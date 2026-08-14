"use client";

import { CSSProperties } from "react";
import { createLead } from "@/app/app/actions";

interface NewLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  pipelineId: string;
  firstStageId: string;
}

export function NewLeadModal({ isOpen, onClose, pipelineId, firstStageId }: NewLeadModalProps) {
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
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
    animation: "modalIn 0.2s ease-out"
  };

  const titleStyle: CSSProperties = {
    fontSize: "18px",
    fontWeight: 600,
    color: "var(--ink)",
    marginBottom: "8px",
    margin: 0
  };

  const subtitleStyle: CSSProperties = {
    fontSize: "14px",
    color: "var(--muted)",
    lineHeight: "1.5",
    marginBottom: "24px",
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
    <>
      <style>{`
        @keyframes modalIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
      <div style={overlayStyle} onClick={handleCancel}>
        <div
          style={modalStyle}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 style={titleStyle}>Novo lead</h2>
          <p style={subtitleStyle}>Adicione uma oportunidade ao início do pipeline.</p>

          <form action={createLead} style={formStyle}>
            <input type="hidden" name="pipeline_id" value={pipelineId} />
            <input type="hidden" name="stage_id" value={firstStageId} />

            <label style={labelStyle}>
              Nome*
              <input
                style={inputStyle}
                name="name"
                required
                maxLength={160}
                placeholder="Nome ou empresa"
              />
            </label>

            <label style={labelStyle}>
              Telefone
              <input
                style={inputStyle}
                name="phone"
                maxLength={32}
                placeholder="(11) 99999-9999"
              />
            </label>

            <label style={labelStyle}>
              E-mail
              <input
                style={inputStyle}
                name="email"
                type="email"
                maxLength={254}
                placeholder="contato@empresa.com.br"
              />
            </label>

            <label style={labelStyle}>
              Origem
              <input
                style={inputStyle}
                name="source"
                maxLength={120}
                placeholder="Indicação, site, anúncio..."
              />
            </label>

            <label style={labelStyle}>
              Valor
              <input
                style={inputStyle}
                name="value"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
              />
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
                Adicionar lead
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
