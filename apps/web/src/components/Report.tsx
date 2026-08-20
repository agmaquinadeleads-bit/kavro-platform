import type { ReportEvolutionPoint, ReportHourPoint, ReportLossReasonPoint, ReportSourcePoint, ReportStageValuePoint } from "./report-charts";
import { ReportChartsLoader } from "./report-charts-loader";
import { ReportFilterBar } from "./ReportFilterBar";

export type ReportSummary = {
  totalCount: number;
  wonCount: number;
  lostCount: number;
  revenueWonCents: number;
  avgTicketCents: number;
  avgClosingDays: number | null;
};

export type ReportOwnerRow = { ownerId: string | null; name: string; leadCount: number; wonCount: number; revenueWonCents: number };
export type ReportFunnelStage = { stageId: string; stageName: string; position: number; isWon: boolean; isLost: boolean; leadCount: number; totalValueInCents: number };

type ReportProps = {
  feedback?: { kind: "error" | "success"; message: string };
  dateFrom: string | null;
  dateTo: string | null;
  owner: string | null;
  source: string | null;
  members: Array<{ id: string; name: string }>;
  origins: string[];
  summary: ReportSummary;
  responseTimeMinutes: number | null;
  evolutionData: ReportEvolutionPoint[];
  sourceData: ReportSourcePoint[];
  ownerRows: ReportOwnerRow[];
  funnelData: ReportFunnelStage[];
  lossReasonData: ReportLossReasonPoint[];
  hourData: ReportHourPoint[];
};

function currency(valueInCents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valueInCents / 100);
}

function stageKind(stage: ReportFunnelStage): "green" | "red" | "blue" {
  return stage.isWon ? "green" : stage.isLost ? "red" : "blue";
}

function formatClosingDays(days: number | null) {
  if (days === null) return "—";
  if (days < 1) return `${Math.round(days * 24)}h`;
  return `${days.toFixed(1)} dias`;
}

function formatResponseTime(minutes: number | null) {
  if (minutes === null) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return remainder > 0 ? `${hours}h ${remainder}min` : `${hours}h`;
}

export function Report({ feedback, dateFrom, dateTo, owner, source, members, origins, summary, responseTimeMinutes, evolutionData, sourceData, ownerRows, funnelData, lossReasonData, hourData }: ReportProps) {
  const conversionRate = summary.totalCount > 0 ? (summary.wonCount / summary.totalCount) * 100 : 0;

  // "Melhor origem" = origem que mais gerou leads no período. "Melhor
  // criativo" = origem que mais gerou VENDAS — não existe hoje uma
  // separação real entre origem/criativo no schema (ambos vêm do mesmo
  // leads.source), então usamos volume vs. conversão pra diferenciar os
  // dois indicadores em vez de duplicar a mesma métrica com nomes diferentes.
  const bestOrigin = sourceData.length > 0 ? [...sourceData].sort((a, b) => b.leadCount - a.leadCount)[0] : null;
  const bestCreative = sourceData.some((point) => point.wonCount > 0) ? [...sourceData].sort((a, b) => b.wonCount - a.wonCount)[0] : null;
  const topOwners = [...ownerRows].filter((row) => row.leadCount > 0).sort((a, b) => b.revenueWonCents - a.revenueWonCents || b.wonCount - a.wonCount).slice(0, 3);

  const metrics = [
    { label: "Total no período", value: String(summary.totalCount), detail: "leads criados" },
    { label: "Convertidos", value: String(summary.wonCount), detail: "negócios ganhos" },
    { label: "Perdidos", value: String(summary.lostCount), detail: "negócios perdidos" },
    { label: "Taxa de conversão", value: `${conversionRate.toFixed(1)}%`, detail: "convertidos / total" },
    { label: "Valor fechado", value: currency(summary.revenueWonCents), detail: "receita ganha no período" },
    { label: "Ticket médio", value: currency(summary.avgTicketCents), detail: "por negócio ganho" },
    { label: "Tempo médio fechamento", value: formatClosingDays(summary.avgClosingDays), detail: "da criação até ganho" },
    { label: "Tempo médio de resposta", value: formatResponseTime(responseTimeMinutes), detail: "primeira resposta no WhatsApp" }
  ];

  const funnelTotal = funnelData.reduce((sum, stage) => sum + stage.leadCount, 0);
  const funnelRows = funnelData.map((stage, index) => {
    const percentOfTotal = funnelTotal > 0 ? (stage.leadCount / funnelTotal) * 100 : 0;
    const previousStage = index > 0 ? funnelData[index - 1] : undefined;
    const conversionRateFromPrevious = previousStage && previousStage.leadCount > 0 ? (stage.leadCount / previousStage.leadCount) * 100 : null;
    return { stage, percentOfTotal, conversionRateFromPrevious };
  });

  const stageValueData: ReportStageValuePoint[] = funnelData.map((stage) => ({ stageName: stage.stageName, totalValueInCents: stage.totalValueInCents }));
  const filterActive = Boolean(dateFrom && dateTo);

  return (
    <div className="content" id="relatorios">
      {feedback ? (
        <div className={`feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>
          {feedback.message}
        </div>
      ) : null}

      <div className="report-print-header">
        <p className="eyebrow">RELATÓRIO COMERCIAL</p>
        <h1>Relatórios</h1>
        <p>{filterActive ? `Período de ${dateFrom} até ${dateTo}` : "Todo o período"}</p>
      </div>

      <ReportFilterBar members={members} origins={origins} currentFilters={{ dateFrom, dateTo, owner, source }} />

      <section className="metrics" aria-label="Indicadores do relatório">
        {metrics.map((metric) => (
          <article className="metric" key={metric.label}>
            <div>
              <span>{metric.label}</span>
            </div>
            <strong>{metric.value}</strong>
            <small>
              <em>{metric.detail}</em>
            </small>
          </article>
        ))}
      </section>

      <section className="report-highlights" aria-label="Destaques do período">
        <article className="report-highlight-card">
          <span className="eyebrow">MELHOR ORIGEM</span>
          <strong>{bestOrigin ? bestOrigin.source : "Sem dados"}</strong>
          <small>{bestOrigin ? `${bestOrigin.leadCount} ${bestOrigin.leadCount === 1 ? "lead" : "leads"}` : "Nenhum lead no período"}</small>
        </article>
        <article className="report-highlight-card">
          <span className="eyebrow">MELHOR CRIATIVO</span>
          <strong>{bestCreative ? bestCreative.source : "Sem dados"}</strong>
          <small>{bestCreative ? `${bestCreative.wonCount} ${bestCreative.wonCount === 1 ? "venda" : "vendas"}` : "Nenhuma venda no período"}</small>
        </article>
        <article className="report-highlight-card report-highlight-wide">
          <span className="eyebrow">TOP 3 VENDEDORES</span>
          {topOwners.length > 0 ? (
            <ol className="report-top-owners">
              {topOwners.map((topOwner) => (
                <li key={topOwner.ownerId ?? "unassigned"}>
                  <strong>{topOwner.name}</strong>
                  <span>{currency(topOwner.revenueWonCents)} · {topOwner.wonCount} {topOwner.wonCount === 1 ? "venda" : "vendas"}</span>
                </li>
              ))}
            </ol>
          ) : (
            <small>Nenhuma venda no período</small>
          )}
        </article>
      </section>

      <ReportChartsLoader evolutionData={evolutionData} sourceData={sourceData} stageValueData={stageValueData} lossReasonData={lossReasonData} hourData={hourData} />

      <section className="funnel-section" aria-labelledby="report-funnel-title">
        <h3 id="report-funnel-title">Funil de conversão (todos os pipelines)</h3>
        {funnelTotal > 0 ? (
          <div className="funnel-list">
            {funnelRows.map(({ stage, percentOfTotal, conversionRateFromPrevious }) => (
              <div className="funnel-row" key={stage.stageId}>
                <span className="funnel-row-label">{stage.stageName}</span>
                <div className="funnel-bar-track">
                  <div className={`funnel-bar-fill ${stageKind(stage)}`} style={{ width: `${percentOfTotal}%` }} />
                </div>
                <div className="funnel-row-stats">
                  <strong>
                    {stage.leadCount} {stage.leadCount === 1 ? "lead" : "leads"}
                  </strong>
                  <span>
                    {percentOfTotal.toFixed(1)}% do total{conversionRateFromPrevious !== null ? ` · ${conversionRateFromPrevious.toFixed(1)}% da anterior` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="chart-empty">
            <span>Sem dados suficientes ainda</span>
          </div>
        )}
      </section>

      <section className="report-owners-section" aria-labelledby="report-owners-title">
        <h3 id="report-owners-title">Vendedor vs. resultado</h3>
        {ownerRows.length > 0 ? (
          <div className="report-table-wrap">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th>Leads</th>
                  <th>Vendas</th>
                  <th>Conv.</th>
                  <th>Receita</th>
                </tr>
              </thead>
              <tbody>
                {ownerRows.map((row) => {
                  const rowConversion = row.leadCount > 0 ? (row.wonCount / row.leadCount) * 100 : 0;
                  return (
                    <tr key={row.ownerId ?? "unassigned"}>
                      <td>{row.name}</td>
                      <td>{row.leadCount}</td>
                      <td>{row.wonCount}</td>
                      <td>{rowConversion.toFixed(1)}%</td>
                      <td>{currency(row.revenueWonCents)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="chart-empty">
            <span>Sem dados suficientes ainda</span>
          </div>
        )}
      </section>
    </div>
  );
}
