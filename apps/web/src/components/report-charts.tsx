"use client";

import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type TooltipItem
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";

// Mesmo registro seletivo de dashboard-charts.tsx (nunca "chart.js/auto" —
// ver comentário lá para o porquê). Chart.register é idempotente, então
// registrar de novo aqui (chunk separado, carregado só na rota /relatorios)
// não conflita com o registro do dashboard.
Chart.register(
  LineController,
  BarController,
  DoughnutController,
  ArcElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler
);

export type ReportEvolutionPoint = { weekStart: string; leadCount: number; wonCount: number };
export type ReportSourcePoint = { source: string; leadCount: number; wonCount: number };
export type ReportStageValuePoint = { stageName: string; totalValueInCents: number };
export type ReportLossReasonPoint = { lossReason: string; leadCount: number };
export type ReportHourPoint = { hour: number; leadCount: number };

export type ReportChartsProps = {
  evolutionData: ReportEvolutionPoint[];
  sourceData: ReportSourcePoint[];
  stageValueData: ReportStageValuePoint[];
  lossReasonData: ReportLossReasonPoint[];
  hourData: ReportHourPoint[];
};

// Faixas usadas só para o resumo em texto acima do gráfico de horário (o
// gráfico em si mostra as 24h individualmente) — mesmas faixas que
// qualquer gestor de tráfego já usa informalmente pra falar de "pico da
// manhã/tarde/noite".
const PERIOD_RANGES: Array<{ label: string; from: number; to: number }> = [
  { label: "Madrugada", from: 0, to: 5 },
  { label: "Manhã", from: 6, to: 11 },
  { label: "Tarde", from: 12, to: 17 },
  { label: "Noite", from: 18, to: 23 }
];

const BLUE = "#2563eb";
const BLUE_LIGHT = "rgba(37, 99, 235, 0.14)";
const BLUE_MID = "#60a5fa";
const BLUE_DARK = "#1d4ed8";
const GREEN = "#16a34a";
const GREEN_LIGHT = "rgba(22, 163, 74, 0.14)";
const GREEN_MID = "#22c55e";
const GREEN_DARK = "#15803d";
const PURPLE = "#7c3aed";
const PURPLE_MID = "#a78bfa";
const PURPLE_DARK = "#5b21b6";
const NEUTRAL = "#b7c2bb";

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function formatCurrency(valueInCents: number): string {
  return currencyFormatter.format(valueInCents / 100);
}

function formatWeekLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}`;
}

function EmptyChart() {
  return (
    <div className="chart-empty">
      <span>Sem dados suficientes ainda</span>
    </div>
  );
}

function EvolutionChart({ data }: { data: ReportEvolutionPoint[] }) {
  if (data.length === 0) return <EmptyChart />;

  const chartData = {
    labels: data.map((point) => formatWeekLabel(point.weekStart)),
    datasets: [
      {
        label: "Leads criados",
        data: data.map((point) => point.leadCount),
        borderColor: BLUE,
        backgroundColor: BLUE_LIGHT,
        pointBackgroundColor: BLUE,
        pointBorderColor: "#fff",
        pointRadius: 3,
        borderWidth: 2,
        tension: 0.35,
        fill: true
      },
      {
        label: "Vendas",
        data: data.map((point) => point.wonCount),
        borderColor: GREEN,
        backgroundColor: GREEN_LIGHT,
        pointBackgroundColor: GREEN,
        pointBorderColor: "#fff",
        pointRadius: 3,
        borderWidth: 2,
        tension: 0.35,
        fill: true
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: "bottom" as const },
      tooltip: { intersect: false, mode: "index" as const }
    },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, ticks: { precision: 0 } }
    }
  };

  return <Line data={chartData} options={options} />;
}

function SourceChart({ data }: { data: ReportSourcePoint[] }) {
  if (data.length === 0) return <EmptyChart />;

  const chartData = {
    labels: data.map((point) => point.source),
    datasets: [
      { label: "Leads", data: data.map((point) => point.leadCount), backgroundColor: BLUE, borderRadius: 6, maxBarThickness: 32 },
      { label: "Vendas", data: data.map((point) => point.wonCount), backgroundColor: GREEN, borderRadius: 6, maxBarThickness: 32 }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: "bottom" as const },
      tooltip: { intersect: false, mode: "index" as const }
    },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, ticks: { precision: 0 } }
    }
  };

  return <Bar data={chartData} options={options} />;
}

function SourceDonutChart({ data }: { data: ReportSourcePoint[] }) {
  if (data.length === 0) return <EmptyChart />;

  const palette = [BLUE, BLUE_MID, BLUE_DARK, "#93c5fd", "#1e3a8a", "#b7c2bb"];
  const chartData = {
    labels: data.map((point) => point.source),
    datasets: [
      {
        label: "Leads",
        data: data.map((point) => point.leadCount),
        backgroundColor: data.map((_, index) => palette[index % palette.length] ?? BLUE),
        borderColor: "#fff",
        borderWidth: 2
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: "bottom" as const },
      tooltip: { intersect: false, mode: "index" as const }
    }
  };

  return <Doughnut data={chartData} options={options} />;
}

function StageValueChart({ data }: { data: ReportStageValuePoint[] }) {
  if (data.length === 0) return <EmptyChart />;

  const palette = [GREEN, GREEN_MID, GREEN_DARK, "#7fd6a8", "#0a5c38"];
  const chartData = {
    labels: data.map((point) => point.stageName),
    datasets: [
      {
        label: "Valor",
        data: data.map((point) => point.totalValueInCents / 100),
        backgroundColor: data.map((_, index) => palette[index % palette.length] ?? GREEN),
        borderRadius: 6,
        maxBarThickness: 42
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        intersect: false,
        mode: "index" as const,
        callbacks: {
          label: (context: TooltipItem<"bar">) => formatCurrency(Math.round((context.parsed.y ?? 0) * 100))
        }
      }
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value: string | number) => formatCurrency(Math.round(Number(value) * 100))
        }
      }
    }
  };

  return <Bar data={chartData} options={options} />;
}

function HourChart({ data }: { data: ReportHourPoint[] }) {
  const total = data.reduce((sum, point) => sum + point.leadCount, 0);
  if (total === 0) return <EmptyChart />;

  const maxCount = Math.max(...data.map((point) => point.leadCount));
  const chartData = {
    labels: data.map((point) => `${String(point.hour).padStart(2, "0")}h`),
    datasets: [
      {
        label: "Leads",
        data: data.map((point) => point.leadCount),
        backgroundColor: data.map((point) => (point.leadCount === maxCount ? BLUE_DARK : BLUE)),
        borderRadius: 4,
        maxBarThickness: 18
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { intersect: false, mode: "index" as const }
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
      y: { beginAtZero: true, ticks: { precision: 0 } }
    }
  };

  return <Bar data={chartData} options={options} />;
}

function hourChartInsight(data: ReportHourPoint[]): string | null {
  const total = data.reduce((sum, point) => sum + point.leadCount, 0);
  if (total === 0) return null;

  const peak = [...data].sort((a, b) => b.leadCount - a.leadCount)[0];
  const periodTotals = PERIOD_RANGES.map((period) => ({
    ...period,
    count: data.filter((point) => point.hour >= period.from && point.hour <= period.to).reduce((sum, point) => sum + point.leadCount, 0)
  }));
  const dominant = [...periodTotals].sort((a, b) => b.count - a.count)[0];
  if (!peak || !dominant) return null;

  const dominantShare = Math.round((dominant.count / total) * 100);
  return `Pico às ${String(peak.hour).padStart(2, "0")}h (${peak.leadCount} ${peak.leadCount === 1 ? "lead" : "leads"}) · ${dominant.label} concentra ${dominantShare}% dos leads`;
}

function LossReasonChart({ data }: { data: ReportLossReasonPoint[] }) {
  if (data.length === 0) return <EmptyChart />;

  const palette = [PURPLE, PURPLE_MID, PURPLE_DARK, "#c4b5fd", "#4c1d95", NEUTRAL];
  const chartData = {
    labels: data.map((point) => point.lossReason),
    datasets: [
      {
        label: "Leads perdidos",
        data: data.map((point) => point.leadCount),
        backgroundColor: data.map((point, index) => (point.lossReason === "Sem motivo informado" ? NEUTRAL : palette[index % palette.length] ?? PURPLE)),
        borderColor: "#fff",
        borderWidth: 2
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: "bottom" as const },
      tooltip: { intersect: false, mode: "index" as const }
    }
  };

  return <Doughnut data={chartData} options={options} />;
}

export function ReportCharts({ evolutionData, sourceData, stageValueData, lossReasonData, hourData }: ReportChartsProps) {
  const hourInsight = hourChartInsight(hourData);

  return (
    <section className="dashboard-charts" aria-label="Gráficos do relatório">
      <div className="dashboard-charts-grid">
        <article className="chart-card">
          <h3>Evolução de leads (semanal)</h3>
          <div className="chart-canvas-wrap">
            <EvolutionChart data={evolutionData} />
          </div>
        </article>
        <article className="chart-card">
          <h3>Leads por horário do dia</h3>
          {hourInsight ? <p className="chart-card-subtitle">{hourInsight}</p> : null}
          <div className="chart-canvas-wrap">
            <HourChart data={hourData} />
          </div>
        </article>
        <article className="chart-card">
          <h3>Origem vs. resultado</h3>
          <div className="chart-canvas-wrap">
            <SourceChart data={sourceData} />
          </div>
        </article>
        <article className="chart-card">
          <h3>Leads por origem</h3>
          <div className="chart-canvas-wrap">
            <SourceDonutChart data={sourceData} />
          </div>
        </article>
        <article className="chart-card">
          <h3>Valor por etapa</h3>
          <div className="chart-canvas-wrap">
            <StageValueChart data={stageValueData} />
          </div>
        </article>
        <article className="chart-card">
          <h3>Motivos de perda</h3>
          <div className="chart-canvas-wrap">
            <LossReasonChart data={lossReasonData} />
          </div>
        </article>
      </div>
    </section>
  );
}
