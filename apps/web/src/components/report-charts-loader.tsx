"use client";

import dynamic from "next/dynamic";
import type { ReportChartsProps } from "./report-charts";

// Mesmo shim de dashboard-charts-loader.tsx: next/dynamic({ssr:false}) só é
// permitido num Client Component, e mantém o bundle do Chart.js fora do
// carregamento inicial de /app/relatorios (Server Component).
const ReportCharts = dynamic(() => import("./report-charts").then((mod) => mod.ReportCharts), {
  ssr: false,
  loading: () => (
    <section className="dashboard-charts" aria-label="Gráficos do relatório">
      <div className="dashboard-charts-placeholder">
        <span>Carregando gráficos...</span>
      </div>
    </section>
  )
});

export function ReportChartsLoader(props: ReportChartsProps) {
  return <ReportCharts {...props} />;
}
