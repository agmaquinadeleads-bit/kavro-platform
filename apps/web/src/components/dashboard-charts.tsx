"use client";

import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip
} from "chart.js";

// Registro seletivo dos componentes Chart.js usados pelas próximas tasks
// (evolução/origem = linha e barra, funil = arco). NUNCA importar
// "chart.js/auto" — isso inclui todos os tipos de gráfico e infla o bundle
// muito além da meta de <100KB por rota definida em PERFORMANCE.md.
Chart.register(
  LineController,
  BarController,
  ArcElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend
);

// Shell registrado e pronto para receber os dados agregados (get_dashboard_*
// via RPC) como props nas próximas tasks: KPIs, evolução/origem,
// perda/faturamento, funil. Nenhum gráfico específico é renderizado ainda.
export function DashboardCharts() {
  return (
    <section className="dashboard-charts" aria-label="Gráficos do dashboard">
      <div className="dashboard-charts-placeholder">
        <span>Carregando gráficos...</span>
      </div>
    </section>
  );
}
