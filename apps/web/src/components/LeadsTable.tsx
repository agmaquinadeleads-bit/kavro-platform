"use client";

import { CSSProperties } from "react";
import { LeadRow, type LeadRowData } from "./LeadRow";

interface LeadsTableProps {
  leads: LeadRowData[];
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  onHeaderClick?: (columnKey: string) => void;
  selectedLeadIds?: Set<string>;
  onSelectChange?: (leadId: string, isSelected: boolean) => void;
  onSelectAllChange?: (selectAll: boolean) => void;
}

export function LeadsTable({
  leads,
  sortBy = "created_at",
  sortOrder = "desc",
  onHeaderClick,
  selectedLeadIds = new Set(),
  onSelectChange,
  onSelectAllChange
}: LeadsTableProps) {
  const tableStyle: CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "920px"
  };

  const theadStyle: CSSProperties = {
    backgroundColor: "#fafbfa",
    borderBottom: "1px solid var(--line)"
  };

  const thStyle: CSSProperties = {
    padding: "12px",
    textAlign: "left",
    fontSize: "10px",
    fontWeight: 700,
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    borderBottom: "1px solid var(--line)",
    cursor: onHeaderClick ? "pointer" : "default",
    userSelect: "none",
    transition: "background-color 0.15s ease"
  };

  const getSortIcon = (columnKey: string): string => {
    if (sortBy !== columnKey) return "⇅";
    return sortOrder === "asc" ? "▲" : "▼";
  };

  const handleHeaderClick = (columnKey: string) => {
    if (onHeaderClick) {
      onHeaderClick(columnKey);
    }
  };

  const handleHeaderHoverEnter = (e: React.MouseEvent<HTMLTableCellElement>) => {
    e.currentTarget.style.backgroundColor = "#f0f2f0";
  };

  const handleHeaderHoverLeave = (e: React.MouseEvent<HTMLTableCellElement>) => {
    e.currentTarget.style.backgroundColor = "#fafbfa";
  };

  const emptyStateStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "60px 24px",
    textAlign: "center",
    backgroundColor: "var(--surface)",
    borderRadius: "8px",
    border: "1px solid var(--line)"
  };

  const emptyStateIconStyle: CSSProperties = {
    fontSize: "48px",
    marginBottom: "16px",
    opacity: 0.5
  };

  const emptyStateHeadingStyle: CSSProperties = {
    fontSize: "16px",
    fontWeight: 600,
    color: "var(--ink)",
    marginBottom: "8px"
  };

  const emptyStateDescStyle: CSSProperties = {
    fontSize: "14px",
    color: "var(--muted)",
    maxWidth: "400px",
    lineHeight: "1.5"
  };

  if (leads.length === 0) {
    return (
      <div style={emptyStateStyle}>
        <div style={emptyStateIconStyle}>📋</div>
        <h3 style={emptyStateHeadingStyle}>Nenhum lead criado</h3>
        <p style={emptyStateDescStyle}>
          Comece adicionando o primeiro lead ou importe uma lista de contatos
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        overflowX: "auto",
        width: "100%",
        maxWidth: "100%"
      }}
    >
      <table style={tableStyle}>
        <thead style={theadStyle}>
          <tr>
            <th
              style={{ ...thStyle, width: "40px", textAlign: "center", cursor: "pointer" }}
              onClick={() => {
                if (onSelectAllChange) {
                  const isAllSelected = selectedLeadIds.size === leads.length;
                  onSelectAllChange(!isAllSelected);
                }
              }}
              onMouseEnter={handleHeaderHoverEnter}
              onMouseLeave={handleHeaderHoverLeave}
            >
              <input
                type="checkbox"
                checked={selectedLeadIds.size === leads.length && leads.length > 0}
                onChange={(e) => {
                  if (onSelectAllChange) {
                    onSelectAllChange(e.currentTarget.checked);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "16px",
                  height: "16px",
                  cursor: "pointer",
                  accentColor: "var(--primary)"
                }}
                title="Selecionar todos"
              />
            </th>
            <th
              style={thStyle}
              onClick={() => handleHeaderClick("name")}
              onMouseEnter={handleHeaderHoverEnter}
              onMouseLeave={handleHeaderHoverLeave}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                Nome
                <span style={{ fontSize: "12px", opacity: 0.6 }}>{getSortIcon("name")}</span>
              </span>
            </th>
            <th
              style={thStyle}
              onClick={() => handleHeaderClick("email")}
              onMouseEnter={handleHeaderHoverEnter}
              onMouseLeave={handleHeaderHoverLeave}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                Email
                <span style={{ fontSize: "12px", opacity: 0.6 }}>{getSortIcon("email")}</span>
              </span>
            </th>
            <th
              style={thStyle}
              onClick={() => handleHeaderClick("phone")}
              onMouseEnter={handleHeaderHoverEnter}
              onMouseLeave={handleHeaderHoverLeave}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                Telefone
                <span style={{ fontSize: "12px", opacity: 0.6 }}>{getSortIcon("phone")}</span>
              </span>
            </th>
            <th
              style={thStyle}
              onClick={() => handleHeaderClick("source")}
              onMouseEnter={handleHeaderHoverEnter}
              onMouseLeave={handleHeaderHoverLeave}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                Origem
                <span style={{ fontSize: "12px", opacity: 0.6 }}>{getSortIcon("source")}</span>
              </span>
            </th>
            <th
              style={thStyle}
              onClick={() => handleHeaderClick("stage_id")}
              onMouseEnter={handleHeaderHoverEnter}
              onMouseLeave={handleHeaderHoverLeave}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                Etapa
                <span style={{ fontSize: "12px", opacity: 0.6 }}>{getSortIcon("stage_id")}</span>
              </span>
            </th>
            <th
              style={{ ...thStyle, textAlign: "right" }}
              onClick={() => handleHeaderClick("value_in_cents")}
              onMouseEnter={handleHeaderHoverEnter}
              onMouseLeave={handleHeaderHoverLeave}
            >
              <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                Valor
                <span style={{ fontSize: "12px", opacity: 0.6 }}>{getSortIcon("value_in_cents")}</span>
              </span>
            </th>
            <th
              style={thStyle}
              onClick={() => handleHeaderClick("owner_id")}
              onMouseEnter={handleHeaderHoverEnter}
              onMouseLeave={handleHeaderHoverLeave}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                Atribuído
                <span style={{ fontSize: "12px", opacity: 0.6 }}>{getSortIcon("owner_id")}</span>
              </span>
            </th>
            <th
              style={thStyle}
              onClick={() => handleHeaderClick("created_at")}
              onMouseEnter={handleHeaderHoverEnter}
              onMouseLeave={handleHeaderHoverLeave}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                Data
                <span style={{ fontSize: "12px", opacity: 0.6 }}>{getSortIcon("created_at")}</span>
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <LeadRow
              key={lead.id}
              lead={lead}
              isSelected={selectedLeadIds.has(lead.id)}
              onSelectChange={onSelectChange}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
