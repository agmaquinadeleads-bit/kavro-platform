"use client";

import { CSSProperties, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Stage {
  id: string;
  name: string;
}

interface Creative {
  id: string;
  name: string;
}

interface FilterBarProps {
  searchText: string;
  dateFrom: string | null;
  dateTo: string | null;
  selectedStage: string | null;
  selectedOrigin: string | null;
  selectedCreative: string | null;
  stages: Stage[];
  origins: string[];
  creatives: Creative[];
}

export function FilterBar({
  searchText,
  dateFrom,
  dateTo,
  selectedStage,
  selectedOrigin,
  selectedCreative,
  stages,
  origins,
  creatives
}: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [localSearch, setLocalSearch] = useState(searchText);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  const containerStyle: CSSProperties = {
    backgroundColor: "var(--panel)",
    border: "1px solid var(--line)",
    borderRadius: "8px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    padding: "14px 18px",
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    alignItems: "flex-end",
    width: "100%",
    boxSizing: "border-box"
  };

  const inputStyle: CSSProperties = {
    padding: "0 12px",
    backgroundColor: "var(--input-bg)",
    borderRadius: "10px",
    border: "1px solid var(--line)",
    fontSize: "13px",
    minWidth: 0,
    boxSizing: "border-box",
    height: "42px",
    lineHeight: "42px",
    color: "var(--text)",
    boxShadow: "none",
    outline: "none",
    fontFamily: "inherit",
    flex: "1 1 180px",
    transition: "all 0.15s ease"
  };

  const selectStyle: CSSProperties = {
    ...inputStyle,
    flex: "0 1 160px",
    cursor: "pointer",
    appearance: "none",
    paddingRight: "28px",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 8px center",
    backgroundColor: "var(--input-bg)"
  };

  const dateGroupStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    flex: "0 0 150px",
    minWidth: "150px"
  };

  const dateLabel: CSSProperties = {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--muted)",
    margin: 0,
    lineHeight: "1.2",
    whiteSpace: "nowrap"
  };

  const dateInputStyle: CSSProperties = {
    ...inputStyle,
    flex: 1,
    height: "36px",
    lineHeight: "36px",
    fontSize: "12px",
    appearance: "none",
    WebkitAppearance: "none"
  };

  const buttonStyle: CSSProperties = {
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid var(--line)",
    background: "var(--surface)",
    color: "var(--ink)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    transition: "all 0.15s ease",
    whiteSpace: "nowrap",
    fontFamily: "inherit"
  };

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = "var(--primary)";
    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.12)";
  };

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = "var(--line)";
    e.currentTarget.style.boxShadow = "none";
  };

  const handleSearch = useCallback(
    (value: string) => {
      setLocalSearch(value);

      // Clear existing timeout
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }

      // Set new timeout for debounced search (500ms)
      const newTimeout = setTimeout(() => {
        const params = new URLSearchParams(searchParams);

        if (value.trim()) {
          params.set("search", value.trim());
        } else {
          params.delete("search");
        }

        params.set("page", "1");
        router.push(`?${params.toString()}`);
      }, 500);

      setSearchTimeout(newTimeout);
    },
    [searchParams, router, searchTimeout]
  );

  const handleFilterChange = useCallback(
    (filterKey: string, value: string | null) => {
      const params = new URLSearchParams(searchParams);

      if (value) {
        params.set(filterKey, value);
      } else {
        params.delete(filterKey);
      }

      params.set("page", "1");
      router.push(`?${params.toString()}`);
    },
    [searchParams, router]
  );

  const handleDateChange = useCallback(
    (type: "dateFrom" | "dateTo", value: string) => {
      const params = new URLSearchParams(searchParams);

      if (value) {
        params.set(type, value);
      } else {
        params.delete(type);
      }

      params.set("page", "1");
      router.push(`?${params.toString()}`);
    },
    [searchParams, router]
  );

  const handleReset = useCallback(() => {
    // Create new params with only pagination/sort params
    const params = new URLSearchParams();
    const currentPageSize = searchParams.get("pageSize") || "25";
    const currentSortBy = searchParams.get("sortBy") || "created_at";
    const currentSortOrder = searchParams.get("sortOrder") || "desc";

    params.set("page", "1");
    params.set("pageSize", currentPageSize);
    params.set("sortBy", currentSortBy);
    params.set("sortOrder", currentSortOrder);

    setLocalSearch("");
    router.push(`?${params.toString()}`);
  }, [searchParams, router]);

  return (
    <div style={containerStyle}>
      <input
        type="text"
        placeholder="Buscar por nome ou email..."
        value={localSearch}
        onChange={(e) => handleSearch(e.target.value)}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        style={inputStyle}
      />

      <div style={dateGroupStyle}>
        <label style={dateLabel}>De</label>
        <input
          type="date"
          value={dateFrom || ""}
          onChange={(e) => handleDateChange("dateFrom", e.target.value)}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          style={dateInputStyle}
        />
      </div>

      <div style={dateGroupStyle}>
        <label style={dateLabel}>Até</label>
        <input
          type="date"
          value={dateTo || ""}
          onChange={(e) => handleDateChange("dateTo", e.target.value)}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          style={dateInputStyle}
        />
      </div>

      <select
        value={selectedStage || ""}
        onChange={(e) => handleFilterChange("stage", e.target.value)}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        style={selectStyle}
      >
        <option value="">Todas as etapas</option>
        {stages.map((stage) => (
          <option key={stage.id} value={stage.id}>
            {stage.name}
          </option>
        ))}
      </select>

      <select
        value={selectedOrigin || ""}
        onChange={(e) => handleFilterChange("origin", e.target.value)}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        style={selectStyle}
      >
        <option value="">Todas as origens</option>
        {origins.map((origin) => (
          <option key={origin} value={origin}>
            {origin}
          </option>
        ))}
      </select>

      <select
        value={selectedCreative || ""}
        onChange={(e) => handleFilterChange("creative", e.target.value)}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        style={selectStyle}
      >
        <option value="">Todos os criativos</option>
        {creatives.map((creative) => (
          <option key={creative.id} value={creative.id}>
            {creative.name}
          </option>
        ))}
      </select>

      <button
        onClick={handleReset}
        style={buttonStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#f5f7f5";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "var(--surface)";
        }}
      >
        🔄 Limpar
      </button>
    </div>
  );
}
