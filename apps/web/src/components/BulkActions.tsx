"use client";

import { CSSProperties } from "react";

interface BulkActionsProps {
  selectedCount: number;
  onDelete: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

export function BulkActions({
  selectedCount,
  onDelete,
  onCancel,
  isDeleting
}: BulkActionsProps) {
  if (selectedCount === 0) {
    return null;
  }

  const toolbarStyle: CSSProperties = {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%)",
    backgroundColor: "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: "8px",
    padding: "12px 28px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "24px",
    zIndex: 100,
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
    animation: "slideUp 0.2s ease-out"
  };

  const leftSectionStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "8px"
  };

  const countTextStyle: CSSProperties = {
    fontSize: "14px",
    fontWeight: 500,
    color: "var(--ink)"
  };

  const actionsSectionStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "8px"
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
    transition: "background-color 0.15s ease",
    display: "flex",
    alignItems: "center",
    gap: "8px"
  };

  const deleteButtonStyle: CSSProperties = {
    padding: "8px 16px",
    fontSize: "14px",
    fontWeight: 500,
    backgroundColor: "#dc2626",
    color: "white",
    border: "1px solid #991b1b",
    borderRadius: "4px",
    cursor: isDeleting ? "not-allowed" : "pointer",
    transition: "background-color 0.15s ease, opacity 0.15s ease",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    opacity: isDeleting ? 0.7 : 1
  };

  const handleDeleteClick = () => {
    if (!isDeleting) {
      onDelete();
    }
  };

  const handleCancelClick = () => {
    if (!isDeleting) {
      onCancel();
    }
  };

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
      <div style={toolbarStyle}>
        <div style={leftSectionStyle}>
          <span style={countTextStyle}>
            {selectedCount} lead{selectedCount !== 1 ? "s" : ""} selecionado{selectedCount !== 1 ? "s" : ""}
          </span>
        </div>

        <div style={actionsSectionStyle}>
          <button
            type="button"
            style={cancelButtonStyle}
            onClick={handleCancelClick}
            disabled={isDeleting}
            onMouseEnter={(e) => {
              if (!isDeleting) {
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
            style={deleteButtonStyle}
            onClick={handleDeleteClick}
            disabled={isDeleting}
            onMouseEnter={(e) => {
              if (!isDeleting) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#991b1b";
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#dc2626";
            }}
          >
            {isDeleting ? "Deletando..." : "🗑️ Deletar"}
          </button>
        </div>
      </div>
    </>
  );
}
