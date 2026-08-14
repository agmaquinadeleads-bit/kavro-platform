"use client";

import { CSSProperties, useState } from "react";

interface LossReasonModalProps {
  isOpen: boolean;
  selectedLeadIds: Set<string> | string[];
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  isLoading: boolean;
}

const LOSS_REASONS = [
  { id: "no_budget", label: "Sem orçamento", icon: "💰" },
  { id: "competitor", label: "Competidor", icon: "🏆" },
  { id: "gave_up", label: "Desistiu", icon: "🚫" },
  { id: "no_contact", label: "Sem contato", icon: "📞" },
  { id: "other", label: "Outro", icon: "❓" },
  { id: "duplicate", label: "Duplicado", icon: "🔄" }
];

export function LossReasonModal({
  isOpen,
  selectedLeadIds,
  onConfirm,
  onCancel,
  isLoading
}: LossReasonModalProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);

  if (!isOpen) return null;

  const leadCount = selectedLeadIds instanceof Set ? selectedLeadIds.size : selectedLeadIds.length;
  const isReasonSelected = selectedReason !== null;

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
    maxWidth: "480px",
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

  const gridStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px",
    marginBottom: "24px"
  };

  const reasonButtonBaseStyle: CSSProperties = {
    padding: "12px",
    borderRadius: "10px",
    border: "1.5px solid var(--line)",
    backgroundColor: "var(--panel)",
    color: "var(--ink)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: isLoading ? "not-allowed" : "pointer",
    textAlign: "left",
    transition: "border-color 0.15s ease, background-color 0.15s ease",
    opacity: isLoading ? 0.6 : 1
  };

  const getReasonButtonStyle = (reasonId: string): CSSProperties => {
    const isSelected = selectedReason === reasonId;
    return {
      ...reasonButtonBaseStyle,
      borderColor: isSelected ? "var(--primary)" : "var(--line)",
      backgroundColor: isSelected ? "rgba(124, 58, 237, 0.16)" : "var(--panel)",
      color: isSelected ? "#c4b5fd" : "var(--ink)"
    };
  };

  const buttonsStyle: CSSProperties = {
    display: "flex",
    gap: "12px",
    justifyContent: "flex-end"
  };

  const cancelButtonStyle: CSSProperties = {
    padding: "8px 16px",
    fontSize: "14px",
    fontWeight: 500,
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
    border: "1px solid var(--line)",
    borderRadius: "4px",
    cursor: isLoading ? "not-allowed" : "pointer",
    transition: "background-color 0.15s ease",
    opacity: isLoading ? 0.5 : 1
  };

  const confirmButtonStyle: CSSProperties = {
    padding: "8px 16px",
    fontSize: "14px",
    fontWeight: 500,
    backgroundColor: isReasonSelected && !isLoading ? "var(--primary)" : "#ccc",
    color: "white",
    border: isReasonSelected && !isLoading ? "1px solid var(--primary)" : "1px solid #bbb",
    borderRadius: "4px",
    cursor: isReasonSelected && !isLoading ? "pointer" : "not-allowed",
    transition: "background-color 0.15s ease",
    opacity: isReasonSelected ? 1 : 0.5
  };

  const handleConfirm = () => {
    if (selectedReason && !isLoading) {
      onConfirm(selectedReason);
    }
  };

  const handleCancel = () => {
    if (!isLoading) {
      setSelectedReason(null);
      onCancel();
    }
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
          <h2 style={titleStyle}>Por que esses leads foram perdidos?</h2>
          <p style={subtitleStyle}>
            {leadCount} lead{leadCount !== 1 ? "s" : ""} serão movidos para 'Perdidos'
          </p>

          <div style={gridStyle}>
            {LOSS_REASONS.map((reason) => (
              <button
                key={reason.id}
                type="button"
                style={getReasonButtonStyle(reason.id)}
                onClick={() => !isLoading && setSelectedReason(reason.id)}
                disabled={isLoading}
                onMouseEnter={(e) => {
                  if (!isLoading && selectedReason !== reason.id) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--primary)";
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(124, 58, 237, 0.10)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedReason !== reason.id) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--line)";
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--panel)";
                  }
                }}
              >
                <span style={{ marginRight: "6px" }}>{reason.icon}</span>
                {reason.label}
              </button>
            ))}
          </div>

          <div style={buttonsStyle}>
            <button
              type="button"
              style={cancelButtonStyle}
              onClick={handleCancel}
              disabled={isLoading}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--hover)";
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--surface)";
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              style={confirmButtonStyle}
              onClick={handleConfirm}
              disabled={!isReasonSelected || isLoading}
              onMouseEnter={(e) => {
                if (isReasonSelected && !isLoading) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--primary-dark)";
                }
              }}
              onMouseLeave={(e) => {
                if (isReasonSelected) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--primary)";
                }
              }}
            >
              {isLoading ? "Movendo..." : "Mover para Perdidos"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
