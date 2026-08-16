"use client";

import { CSSProperties } from "react";
import { updateBrandIdentity } from "@/app/app/conteudo/actions";

interface BrandIdentityModalProps {
  isOpen: boolean;
  onClose: () => void;
  brandId: string;
  brandName: string;
  initialValue: string;
}

// Mesmo padrão visual de NewBrandModal.tsx.
export function BrandIdentityModal({ isOpen, onClose, brandId, brandName, initialValue }: BrandIdentityModalProps) {
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
    maxWidth: "520px",
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

  const textareaStyle: CSSProperties = {
    padding: "12px",
    borderRadius: "6px",
    border: "1px solid var(--line)",
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
    fontSize: "14px",
    fontFamily: "inherit",
    resize: "vertical"
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

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={titleStyle}>Identidade visual — {brandName}</h2>
        <p style={subtitleStyle}>
          Tom de voz, paleta de cores, o que sempre ou nunca pode aparecer. Isso entra automaticamente em toda
          geração de linha editorial e imagem dessa marca — não precisa repetir em cada post.
        </p>

        <form action={updateBrandIdentity} style={formStyle}>
          <input type="hidden" name="brand_id" value={brandId} />
          <label style={labelStyle}>
            Diretrizes de marca
            <textarea
              style={textareaStyle}
              name="visual_identity"
              maxLength={4000}
              rows={8}
              defaultValue={initialValue}
              placeholder="Ex: Tom descontraído e próximo. Paleta em tons de verde e areia. Nunca usar imagens de pessoas fumando. Sempre incluir o logo no canto inferior direito quando possível."
              autoFocus
            />
          </label>

          <div style={buttonsStyle}>
            <button
              type="button"
              style={cancelButtonStyle}
              onClick={onClose}
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
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
