"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface DashboardFilters {
  dateFrom: string | null;
  dateTo: string | null;
}

interface DashboardFilterBarProps {
  currentFilters: DashboardFilters;
}

type DatePreset = "today" | "yesterday" | "7d" | "14d" | "30d" | "90d";

// Mesmo padrão de PipelineFilterBar.tsx, só com o campo de data (a visão
// geral é um resumo agregado, não tem busca/etapa/vendedor/origem pra
// filtrar).
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
    case "30d":
    case "90d": {
      const days = preset === "7d" ? 7 : preset === "14d" ? 14 : preset === "30d" ? 30 : 90;
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
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" }
];

export function DashboardFilterBar({ currentFilters }: DashboardFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

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
    pushParams((params) => {
      params.delete("dateFrom");
      params.delete("dateTo");
    });
  }, [pushParams]);

  return (
    <div className="view-filter dashboard-filter">
      <div className="vf-dates">
        <div className="vf-field vf-date-field">
          <label htmlFor="db-date-from">De</label>
          <input
            id="db-date-from"
            type="date"
            className="vf-input"
            value={currentFilters.dateFrom ?? ""}
            onChange={(e) => handleDateChange("dateFrom", e.target.value)}
          />
        </div>

        <div className="vf-field vf-date-field">
          <label htmlFor="db-date-to">Até</label>
          <input
            id="db-date-to"
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
