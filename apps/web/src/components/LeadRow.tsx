"use client";

import Link from "next/link";
import { CSSProperties } from "react";

export interface LeadRowData {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  stageName: string;
  stageColor: "gray" | "blue" | "amber" | "green" | "purple";
  valueInCents: number;
  ownerName: string | null;
  createdAt: string;
}

interface LeadRowProps {
  lead: LeadRowData;
  isSelected?: boolean;
  onSelectChange?: (leadId: string, isSelected: boolean) => void;
}

export function LeadRow({ lead, isSelected = false, onSelectChange }: LeadRowProps) {
  const handleRowClick = () => {
    // Navigate to lead detail page
    window.location.href = `/app/leads/${lead.id}`;
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (onSelectChange) {
      onSelectChange(lead.id, e.currentTarget.checked);
    }
  };

  const formatBRL = (valueInCents: number): string => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(valueInCents / 100);
  };

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }).format(date);
    } catch {
      return "";
    }
  };

  const truncateEmail = (email: string | null): string => {
    if (!email) return "";
    if (email.length > 30) {
      return email.substring(0, 27) + "...";
    }
    return email;
  };

  const stageColorMap: Record<
    "gray" | "blue" | "amber" | "green" | "purple",
    string
  > = {
    gray: "#718078",
    blue: "#2b5a7f",
    amber: "#8a5b00",
    green: "#158a55",
    purple: "#663399"
  };

  const stageBgColorMap: Record<
    "gray" | "blue" | "amber" | "green" | "purple",
    string
  > = {
    gray: "#f5f7f5",
    blue: "#ecf4f9",
    amber: "#fff9ec",
    green: "#f0fbf5",
    purple: "#f5f0ff"
  };

  const badgeStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 8px",
    borderRadius: "4px",
    backgroundColor: stageBgColorMap[lead.stageColor],
    color: stageColorMap[lead.stageColor],
    fontSize: "12px",
    fontWeight: 500,
    whiteSpace: "nowrap"
  };

  // Wrap entire row in a Link styled as a table row
  const rowBgColor = isSelected ? "rgba(37, 99, 235, 0.08)" : "transparent";

  return (
    <tr
      style={{
        borderBottom: "1px solid var(--line)",
        height: "44px",
        cursor: "pointer",
        transition: "background-color 0.15s ease",
        backgroundColor: rowBgColor
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLTableRowElement).style.backgroundColor =
            "#f5f7f5";
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLTableRowElement).style.backgroundColor =
          rowBgColor;
      }}
      onClick={handleRowClick}
    >
      <td
        style={{
          padding: "12px",
          fontSize: "14px",
          fontWeight: 400,
          color: "var(--ink)",
          width: "40px",
          textAlign: "center"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={handleCheckboxChange}
          style={{
            width: "16px",
            height: "16px",
            cursor: "pointer",
            accentColor: "var(--primary)"
          }}
        />
      </td>
      <td
        style={{
          padding: "12px",
          fontSize: "14px",
          fontWeight: 400,
          color: "var(--ink)",
          maxWidth: "160px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}
      >
        {lead.name}
      </td>
      <td
        style={{
          padding: "12px",
          fontSize: "14px",
          fontWeight: 400,
          color: "var(--ink)",
          maxWidth: "140px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}
        title={lead.email || ""}
      >
        {truncateEmail(lead.email)}
      </td>
      <td
        style={{
          padding: "12px",
          fontSize: "14px",
          fontWeight: 400,
          color: "var(--ink)",
          maxWidth: "120px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}
      >
        {lead.phone || "-"}
      </td>
      <td
        style={{
          padding: "12px",
          fontSize: "14px",
          fontWeight: 400,
          color: "var(--ink)",
          maxWidth: "120px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}
      >
        {lead.source || "-"}
      </td>
      <td style={{ padding: "12px" }}>
        <span style={badgeStyle}>{lead.stageName}</span>
      </td>
      <td
        style={{
          padding: "12px",
          fontSize: "14px",
          fontWeight: 400,
          color: "var(--ink)",
          textAlign: "right",
          minWidth: "100px"
        }}
      >
        {formatBRL(lead.valueInCents)}
      </td>
      <td
        style={{
          padding: "12px",
          fontSize: "14px",
          fontWeight: 400,
          color: "var(--ink)",
          maxWidth: "120px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}
      >
        {lead.ownerName || "-"}
      </td>
      <td
        style={{
          padding: "12px",
          fontSize: "14px",
          fontWeight: 400,
          color: "var(--ink)",
          whiteSpace: "nowrap"
        }}
      >
        {formatDate(lead.createdAt)}
      </td>
    </tr>
  );
}
