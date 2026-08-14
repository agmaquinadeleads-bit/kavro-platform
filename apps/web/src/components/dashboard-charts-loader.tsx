"use client";

import dynamic from "next/dynamic";

// next/dynamic com { ssr: false } só é permitido dentro de um Client
// Component no App Router — por isso este wrapper existe separado de
// dashboard-charts.tsx. dashboard.tsx (Server Component) importa só este
// loader, que por sua vez mantém o bundle do Chart.js fora do carregamento
// inicial da rota /app (PERFORMANCE.md: <100KB por rota).
const DashboardCharts = dynamic(() => import("./dashboard-charts").then((mod) => mod.DashboardCharts), {
  ssr: false,
  loading: () => (
    <section className="dashboard-charts" aria-label="Gráficos do dashboard">
      <div className="dashboard-charts-placeholder">
        <span>Carregando gráficos...</span>
      </div>
    </section>
  )
});

export function DashboardChartsLoader() {
  return <DashboardCharts />;
}
