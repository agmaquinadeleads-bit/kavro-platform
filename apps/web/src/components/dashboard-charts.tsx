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

// Registro seletivo dos componentes Chart.js usados pelo dashboard (evolução
// = linha, origem/faturamento = barra, razões de perda = donut). NUNCA
// importar "chart.js/auto" — isso inclui todos os tipos de gráfico e infla o
// bundle muito além da meta de <100KB por rota definida em PERFORMANCE.md.
// Filler é necessário para a área preenchida abaixo da linha de evolução
// (dataset.fill: true) — sem ele o Chart.js ignora o preenchimento.
// DoughnutController é obrigatório para o gráfico de razões de perda: em
// Chart.js v4, ArcElement sozinho não é suficiente (é só o "mark" visual),
// é o *Controller (Doughnut/Pie) que sabe montar o layout de fatias — sem
// registrar DoughnutController o <Doughnut /> não renderiza.
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

export type DashboardEvolutionPoint = { day: string; leadCount: number };
export type DashboardOriginPoint = { source: string; leadCount: number };
export type DashboardLossReasonPoint = { lossReason: string; leadCount: number };
export type DashboardRevenuePoint = { source: string; revenueInCents: number };

export type DashboardChartsProps = {
  evolutionData: DashboardEvolutionPoint[];
  originData: DashboardOriginPoint[];
  lossReasonData: DashboardLossReasonPoint[];
  revenueData: DashboardRevenuePoint[];
};

const GREEN = "#158a55";
const GREEN_LIGHT = "rgba(21, 138, 85, 0.14)";
const GREEN_DARK = "#0d6f44";
const GREEN_MID = "#31b975";
const NEUTRAL = "#b7c2bb";

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function formatCurrency(valueInCents: number): string {
  return currencyFormatter.format(valueInCents / 100);
}

function formatDayLabel(isoDate: string): string {
  // isoDate vem como "YYYY-MM-DD" (coluna `date` do Postgres via RPC).
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}`;
}

function EvolutionChart({ data }: { data: DashboardEvolutionPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="chart-empty">
        <span>Sem dados suficientes ainda</span>
      </div>
    );
  }

  const chartData = {
    labels: data.map((point) => formatDayLabel(point.day)),
    datasets: [
      {
        label: "Leads criados",
        data: data.map((point) => point.leadCount),
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
      legend: { display: false },
      tooltip: { intersect: false, mode: "index" as const }
    },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, ticks: { precision: 0 } }
    }
  };

  return <Line data={chartData} options={options} />;
}

function OriginChart({ data }: { data: DashboardOriginPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="chart-empty">
        <span>Sem dados suficientes ainda</span>
      </div>
    );
  }

  const palette = [GREEN, GREEN_MID, GREEN_DARK, "#7fd6a8", "#0a5c38"];
  const chartData = {
    labels: data.map((point) => point.source),
    datasets: [
      {
        label: "Leads",
        data: data.map((point) => point.leadCount),
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
      tooltip: { intersect: false, mode: "index" as const }
    },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, ticks: { precision: 0 } }
    }
  };

  return <Bar data={chartData} options={options} />;
}

function LossReasonChart({ data }: { data: DashboardLossReasonPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="chart-empty">
        <span>Sem dados suficientes ainda</span>
      </div>
    );
  }

  const palette = [GREEN, GREEN_MID, GREEN_DARK, "#7fd6a8", "#0a5c38", NEUTRAL];
  const chartData = {
    labels: data.map((point) => point.lossReason),
    datasets: [
      {
        label: "Leads perdidos",
        data: data.map((point) => point.leadCount),
        backgroundColor: data.map((point, index) =>
          point.lossReason === "Sem motivo informado" ? NEUTRAL : palette[index % palette.length] ?? GREEN
        ),
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

function RevenueChart({ data }: { data: DashboardRevenuePoint[] }) {
  if (data.length === 0) {
    return (
      <div className="chart-empty">
        <span>Sem dados suficientes ainda</span>
      </div>
    );
  }

  const palette = [GREEN, GREEN_MID, GREEN_DARK, "#7fd6a8", "#0a5c38"];
  const chartData = {
    labels: data.map((point) => point.source),
    datasets: [
      {
        label: "Faturamento",
        data: data.map((point) => point.revenueInCents / 100),
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

export function DashboardCharts({ evolutionData, originData, lossReasonData, revenueData }: DashboardChartsProps) {
  return (
    <section className="dashboard-charts" aria-label="Gráficos do dashboard">
      <div className="dashboard-charts-grid">
        <article className="chart-card">
          <h3>Evolução de leads (30 dias)</h3>
          <div className="chart-canvas-wrap">
            <EvolutionChart data={evolutionData} />
          </div>
        </article>
        <article className="chart-card">
          <h3>Leads por origem</h3>
          <div className="chart-canvas-wrap">
            <OriginChart data={originData} />
          </div>
        </article>
        <article className="chart-card">
          <h3>Razões de perda</h3>
          <div className="chart-canvas-wrap">
            <LossReasonChart data={lossReasonData} />
          </div>
        </article>
        <article className="chart-card">
          <h3>Faturamento por origem</h3>
          <div className="chart-canvas-wrap">
            <RevenueChart data={revenueData} />
          </div>
        </article>
      </div>
    </section>
  );
}
