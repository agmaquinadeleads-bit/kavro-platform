"use client";

import { CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface FilterState {
  search: string;
  dateFrom: string | null;
  dateTo: string | null;
  stage: string | null;
  origin: string | null;
  creative: string | null;
  stageNames?: Record<string, string>;
  creativeNames?: Record<string, string>;
}

interface FilterBadgesProps {
  filters: FilterState;
}

export function FilterBadges({ filters }: FilterBadgesProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const containerStyle: CSSProperties = {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    alignItems: "center",
    width: "100%"
  };

  const badgeStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 12px",
    backgroundColor: "var(--panel-2)",
    border: "1px solid var(--line)",
    borderRadius: "999px",
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--text)",
    whiteSpace: "nowrap"
  };

  const badgeButtonStyle: CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--muted)",
    fontSize: "16px",
    lineHeight: "1",
    padding: "0 2px",
    borderRadius: "999px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.15s ease"
  };

  const handleRemoveFilter = (filterKey: string) => {
    const params = new URLSearchParams(searchParams);
    params.delete(filterKey);
    params.set("page", "1");
    router.push(`?${params.toString()}`);
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr + "T00:00:00");
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit"
    }).format(date);
  };

  const activeFilters = [];

  if (filters.search) {
    activeFilters.push({
      key: "search",
      label: `🔍 ${filters.search}`,
      removeKey: "search"
    });
  }

  if (filters.dateFrom || filters.dateTo) {
    const fromFormatted = filters.dateFrom ? formatDate(filters.dateFrom) : "—";
    const toFormatted = filters.dateTo ? formatDate(filters.dateTo) : "—";
    activeFilters.push({
      key: "dates",
      label: `📅 ${fromFormatted} - ${toFormatted}`,
      removeKey: "dateFrom-dateTo"
    });
  }

  if (filters.stage) {
    const stageName = filters.stageNames?.[filters.stage] || filters.stage;
    activeFilters.push({
      key: "stage",
      label: `📌 ${stageName}`,
      removeKey: "stage"
    });
  }

  if (filters.origin) {
    activeFilters.push({
      key: "origin",
      label: `🌐 ${filters.origin}`,
      removeKey: "origin"
    });
  }

  if (filters.creative) {
    const creativeName = filters.creativeNames?.[filters.creative] || filters.creative;
    activeFilters.push({
      key: "creative",
      label: `🎨 ${creativeName}`,
      removeKey: "creative"
    });
  }

  if (activeFilters.length === 0) {
    return null;
  }

  return (
    <div style={containerStyle}>
      {activeFilters.map((filter) => (
        <div key={filter.key} style={badgeStyle}>
          <span>{filter.label}</span>
          <button
            onClick={() => {
              if (filter.removeKey.includes("-")) {
                // Handle multiple keys (e.g., dateFrom-dateTo)
                const keys = filter.removeKey.split("-");
                keys.forEach((k) => handleRemoveFilter(k));
              } else {
                handleRemoveFilter(filter.removeKey);
              }
            }}
            style={badgeButtonStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--red)";
              e.currentTarget.style.backgroundColor = "#fee2e2";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--muted)";
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            title="Remover filtro"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
