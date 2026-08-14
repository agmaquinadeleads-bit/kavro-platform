"use client";

import { CSSProperties } from "react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  isDangerous = false,
  onConfirm,
  onCancel,
  isLoading = false
}: ConfirmModalProps) {
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
    maxWidth: "400px",
    width: "90%",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
    animation: "modalIn 0.2s ease-out"
  };

  const titleStyle: CSSProperties = {
    fontSize: "18px",
    fontWeight: 600,
    color: "var(--ink)",
    marginBottom: "12px",
    margin: 0
  };

  const messageStyle: CSSProperties = {
    fontSize: "14px",
    color: "var(--muted)",
    lineHeight: "1.5",
    marginBottom: "24px",
    margin: "12px 0 24px 0"
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
    backgroundColor: isDangerous ? "#dc2626" : "var(--primary)",
    color: "white",
    border: isDangerous ? "1px solid #991b1b" : "1px solid var(--primary)",
    borderRadius: "4px",
    cursor: isLoading ? "not-allowed" : "pointer",
    transition: "background-color 0.15s ease",
    opacity: isLoading ? 0.7 : 1
  };

  const handleConfirm = () => {
    if (!isLoading) {
      onConfirm();
    }
  };

  const handleCancel = () => {
    if (!isLoading) {
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
          <h2 style={titleStyle}>{title}</h2>
          <p style={messageStyle}>{message}</p>

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
              {cancelText}
            </button>
            <button
              type="button"
              style={confirmButtonStyle}
              onClick={handleConfirm}
              disabled={isLoading}
              onMouseEnter={(e) => {
                if (!isLoading) {
                  const bgColor = isDangerous ? "#991b1b" : "var(--primary-dark)";
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = bgColor;
                }
              }}
              onMouseLeave={(e) => {
                const bgColor = isDangerous ? "#dc2626" : "var(--primary)";
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = bgColor;
              }}
            >
              {isLoading ? "Deletando..." : confirmText}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
