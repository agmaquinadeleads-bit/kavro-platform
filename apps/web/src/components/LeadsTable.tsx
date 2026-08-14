"use client";

import { CSSProperties } from "react";
import { LeadRow, type LeadRowData } from "./LeadRow";

interface LeadsTableProps {
  leads: LeadRowData[];
}

export function LeadsTable({ leads }: LeadsTableProps) {
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
    borderBottom: "1px solid var(--line)"
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
            <th style={thStyle}>Nome</th>
            <th style={thStyle}>Email</th>
            <th style={thStyle}>Telefone</th>
            <th style={thStyle}>Origem</th>
            <th style={thStyle}>Etapa</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Valor</th>
            <th style={thStyle}>Atribuído</th>
            <th style={thStyle}>Data</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <LeadRow key={lead.id} lead={lead} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
