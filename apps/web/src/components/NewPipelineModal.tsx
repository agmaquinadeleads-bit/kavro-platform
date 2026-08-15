"use client";

import { CSSProperties } from "react";
import { createPipeline } from "@/app/app/actions";

interface NewPipelineModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewPipelineModal({ isOpen, onClose }: NewPipelineModalProps) {
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
        <h2 style={titleStyle}>Novo funil</h2>
        <p style={subtitleStyle}>Crie um novo funil de vendas (ex: Pós-compra, Parceiros).</p>

        <form action={createPipeline} style={formStyle}>
          <label style={labelStyle}>
            Nome*
            <input
              style={inputStyle}
              name="name"
              required
              maxLength={100}
              placeholder="Ex: Pós-compra"
              autoFocus
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
              Criar funil
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
