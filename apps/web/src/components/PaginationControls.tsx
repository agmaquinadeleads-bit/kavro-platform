"use client";

import { CSSProperties } from "react";

interface PaginationControlsProps {
  totalItems: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function PaginationControls({
  totalItems,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange
}: PaginationControlsProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const containerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "16px 0",
    flexWrap: "wrap"
  };

  const infoStyle: CSSProperties = {
    fontSize: "14px",
    color: "var(--muted)",
    whiteSpace: "nowrap"
  };

  const buttonGroupStyle: CSSProperties = {
    display: "flex",
    gap: "8px",
    alignItems: "center"
  };

  const buttonStyle: CSSProperties = {
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid var(--line)",
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s ease",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px"
  };

  const buttonDisabledStyle: CSSProperties = {
    ...buttonStyle,
    opacity: 0.5,
    cursor: "not-allowed",
    backgroundColor: "#fafbfa"
  };

  const buttonHoverStyle: CSSProperties = {
    backgroundColor: "#f5f7f5"
  };

  const selectStyle: CSSProperties = {
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid var(--line)",
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s ease",
    appearance: "none",
    paddingRight: "28px",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 8px center"
  };

  const selectHoverStyle: CSSProperties = {
    backgroundColor: "#f5f7f5"
  };

  const isPrevDisabled = currentPage === 1;
  const isNextDisabled = currentPage >= totalPages;

  return (
    <div style={containerStyle}>
      <div style={infoStyle}>
        {totalItems === 0
          ? "Nenhum lead"
          : `Mostrando ${startItem}-${endItem} de ${totalItems} ${totalItems === 1 ? "lead" : "leads"}`}
      </div>

      <div style={buttonGroupStyle}>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={isPrevDisabled}
          style={isPrevDisabled ? buttonDisabledStyle : buttonStyle}
          onMouseEnter={(e) => {
            if (!isPrevDisabled) {
              Object.assign(e.currentTarget.style, buttonHoverStyle);
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "var(--surface)";
          }}
        >
          ← Anterior
        </button>

        <span style={{ fontSize: "13px", color: "var(--muted)", minWidth: "48px", textAlign: "center" }}>
          {totalItems === 0 ? "—" : `${currentPage}/${totalPages}`}
        </span>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={isNextDisabled}
          style={isNextDisabled ? buttonDisabledStyle : buttonStyle}
          onMouseEnter={(e) => {
            if (!isNextDisabled) {
              Object.assign(e.currentTarget.style, buttonHoverStyle);
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "var(--surface)";
          }}
        >
          Próximo →
        </button>
      </div>

      <select
        value={pageSize}
        onChange={(e) => onPageSizeChange(Number(e.target.value))}
        style={selectStyle}
        onMouseEnter={(e) => {
          Object.assign(e.currentTarget.style, selectHoverStyle);
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "var(--surface)";
        }}
      >
        <option value={25}>25 por página</option>
        <option value={50}>50 por página</option>
        <option value={100}>100 por página</option>
      </select>
    </div>
  );
}
