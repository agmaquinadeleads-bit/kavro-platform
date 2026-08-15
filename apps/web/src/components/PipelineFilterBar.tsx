"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface FilterStage {
  id: string;
  name: string;
}

interface FilterMember {
  id: string;
  name: string;
}

interface PipelineFilters {
  search: string;
  stage: string | null;
  owner: string | null;
  origin: string | null;
  creative: string | null;
  dateFrom: string | null;
  dateTo: string | null;
}

interface PipelineFilterBarProps {
  stages: FilterStage[];
  members: FilterMember[];
  origins: string[];
  currentFilters: PipelineFilters;
}

type DatePreset = "today" | "yesterday" | "7d" | "14d" | "30d";

// Formata como YYYY-MM-DD no fuso local (mesmo formato aceito por <input type="date">).
// Evita usar toISOString() aqui, que converte pra UTC e pode voltar um dia
// pro passado/futuro dependendo do horário local.
function toLocalISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function presetRange(preset: DatePreset): { from: string; to: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayValue = toLocalISODate(today);

  switch (preset) {
    case "today":
      return { from: todayValue, to: todayValue };
    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const value = toLocalISODate(yesterday);
      return { from: value, to: value };
    }
    case "7d":
    case "14d":
    case "30d": {
      const days = preset === "7d" ? 7 : preset === "14d" ? 14 : 30;
      const from = new Date(today);
      from.setDate(from.getDate() - days);
      return { from: toLocalISODate(from), to: todayValue };
    }
  }
}

const PRESET_OPTIONS: Array<{ key: DatePreset; label: string }> = [
  { key: "today", label: "Hoje" },
  { key: "yesterday", label: "Ontem" },
  { key: "7d", label: "7 dias" },
  { key: "14d", label: "14 dias" },
  { key: "30d", label: "30 dias" }
];

export function PipelineFilterBar({ stages, members, origins, currentFilters }: PipelineFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [localSearch, setLocalSearch] = useState(currentFilters.search);
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const activePreset = useMemo<DatePreset | null>(() => {
    if (!currentFilters.dateFrom || !currentFilters.dateTo) return null;
    for (const option of PRESET_OPTIONS) {
      const range = presetRange(option.key);
      if (range.from === currentFilters.dateFrom && range.to === currentFilters.dateTo) {
        return option.key;
      }
    }
    return null;
  }, [currentFilters.dateFrom, currentFilters.dateTo]);

  const pushParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams);
      mutate(params);
      router.push(`?${params.toString()}`);
    },
    [searchParams, router]
  );

  const handleSearch = useCallback(
    (value: string) => {
      setLocalSearch(value);

      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }

      const newTimeout = setTimeout(() => {
        pushParams((params) => {
          if (value.trim()) {
            params.set("search", value.trim());
          } else {
            params.delete("search");
          }
        });
      }, 500);

      setSearchTimeout(newTimeout);
    },
    [pushParams, searchTimeout]
  );

  const handleFilterChange = useCallback(
    (filterKey: string, value: string) => {
      pushParams((params) => {
        if (value) {
          params.set(filterKey, value);
        } else {
          params.delete(filterKey);
        }
      });
    },
    [pushParams]
  );

  const handleDateChange = useCallback(
    (type: "dateFrom" | "dateTo", value: string) => {
      pushParams((params) => {
        if (value) {
          params.set(type, value);
        } else {
          params.delete(type);
        }
      });
    },
    [pushParams]
  );

  const handlePreset = useCallback(
    (preset: DatePreset) => {
      const range = presetRange(preset);
      pushParams((params) => {
        params.set("dateFrom", range.from);
        params.set("dateTo", range.to);
      });
    },
    [pushParams]
  );

  const handleReset = useCallback(() => {
    setLocalSearch("");
    router.push("?");
  }, [router]);

  return (
    <div className="view-filter">
      <div className="vf-field vf-search-field">
        <label htmlFor="pf-search">Buscar</label>
        <input
          id="pf-search"
          type="text"
          className="vf-input"
          placeholder="Nome, telefone ou origem..."
          value={localSearch}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      <div className="vf-field">
        <label htmlFor="pf-stage">Etapa</label>
        <select
          id="pf-stage"
          className="vf-select"
          value={currentFilters.stage ?? ""}
          onChange={(e) => handleFilterChange("stage", e.target.value)}
        >
          <option value="">Todas as etapas</option>
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
        </select>
      </div>

      <div className="vf-field">
        <label htmlFor="pf-owner">Vendedor</label>
        <select
          id="pf-owner"
          className="vf-select"
          value={currentFilters.owner ?? ""}
          onChange={(e) => handleFilterChange("owner", e.target.value)}
        >
          <option value="">Todos os vendedores</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </div>

      <div className="vf-field">
        <label htmlFor="pf-origin">Origem</label>
        <select
          id="pf-origin"
          className="vf-select"
          value={currentFilters.origin ?? ""}
          onChange={(e) => handleFilterChange("origin", e.target.value)}
        >
          <option value="">Todas as origens</option>
          {origins.map((origin) => (
            <option key={origin} value={origin}>
              {origin}
            </option>
          ))}
        </select>
      </div>

      <div className="vf-field">
        <label htmlFor="pf-creative">Criativo</label>
        {/* Tabela de criativos ainda não existe — placeholder desabilitado,
            mesma lógica do FilterBar.tsx usado em /app/leads. */}
        <select id="pf-creative" className="vf-select" value="" disabled>
          <option value="">Em breve</option>
        </select>
      </div>

      <div className="vf-dates">
        <div className="vf-field vf-date-field">
          <label htmlFor="pf-date-from">De</label>
          <input
            id="pf-date-from"
            type="date"
            className="vf-input"
            value={currentFilters.dateFrom ?? ""}
            onChange={(e) => handleDateChange("dateFrom", e.target.value)}
          />
        </div>

        <div className="vf-field vf-date-field">
          <label htmlFor="pf-date-to">Até</label>
          <input
            id="pf-date-to"
            type="date"
            className="vf-input"
            value={currentFilters.dateTo ?? ""}
            onChange={(e) => handleDateChange("dateTo", e.target.value)}
          />
        </div>
      </div>

      <div className="vf-presets">
        {PRESET_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            className={`vf-preset-btn${activePreset === option.key ? " vf-preset-active" : ""}`}
            onClick={() => handlePreset(option.key)}
          >
            {option.label}
          </button>
        ))}
        <button type="button" className="vf-reset-btn" onClick={handleReset}>
          Limpar
        </button>
      </div>
    </div>
  );
}
