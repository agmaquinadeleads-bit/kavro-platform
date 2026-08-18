import Link from "next/link";
import type {
  DashboardEvolutionPoint,
  DashboardLossReasonPoint,
  DashboardOriginPoint,
  DashboardRevenuePoint
} from "./dashboard-charts";
import { DashboardChartsLoader } from "./dashboard-charts-loader";
import { DashboardFilterBar } from "./DashboardFilterBar";

// DashboardStage/DashboardLead continuam exportados daqui porque outros módulos
// (KanbanBoard, /app/pipeline/page.tsx) dependem desses tipos, mesmo que o
// componente Dashboard não use mais stages/leads diretamente (movido pro Kanban).
export type DashboardStage = { id: string; name: string; position: number; isWon: boolean; isLost: boolean; requiresProposal: boolean };
export type DashboardLeadTag = { id: string; name: string; color: string };
export type DashboardLead = { id: string; name: string; email: string | null; phone: string | null; source: string | null; stageId: string; valueInCents: number; version: number; followUpAt: string | null; createdAt: string; tags: DashboardLeadTag[] };
export type DashboardTask = { id: string; leadId: string; leadName: string; title: string; dueAt: string | null; assignedTo: string | null; version: number };
export type DashboardFunnelStage = { stageId: string; stageName: string; position: number; isWon: boolean; isLost: boolean; leadCount: number; totalValueInCents: number };
export type { DashboardEvolutionPoint, DashboardOriginPoint, DashboardLossReasonPoint, DashboardRevenuePoint };

type DashboardProps = {
  tasks: DashboardTask[];
  taskScope: "mine" | "all";
  canSeeTeamTasks: boolean;
  totalCount: number;
  feedback?: { kind: "error" | "success"; message: string };
  dateFrom: string | null;
  dateTo: string | null;
  openLeadsCount: number;
  wonLeadsCount: number;
  openRevenueInCents: number;
  leadsLast7Days: number;
  overdueFollowUpsCount: number;
  todayFollowUpsCount: number;
  evolutionData: DashboardEvolutionPoint[];
  originData: DashboardOriginPoint[];
  lossReasonData: DashboardLossReasonPoint[];
  revenueData: DashboardRevenuePoint[];
  funnelData: DashboardFunnelStage[];
};

function currency(valueInCents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valueInCents / 100); }

function taskDueState(value: string | null) {
  if (!value) return { kind: "no-date", label: "Sem prazo" };
  const date = new Date(value);
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
  if (date.getTime() < now.getTime()) return { kind: "overdue", label: `Atrasada · ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(date)}` };
  if (day.format(date) === day.format(now)) return { kind: "today", label: `Hoje · ${new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(date)}` };
  return { kind: "future", label: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(date) };
}

function stageKind(stage: DashboardFunnelStage): "green" | "red" | "blue" {
  return stage.isWon ? "green" : stage.isLost ? "red" : "blue";
}

export function Dashboard({ tasks, taskScope, canSeeTeamTasks, totalCount, feedback, dateFrom, dateTo, openLeadsCount, wonLeadsCount, openRevenueInCents, leadsLast7Days, overdueFollowUpsCount, todayFollowUpsCount, evolutionData, originData, lossReasonData, revenueData, funnelData }: DashboardProps) {
  const closedTotal = openLeadsCount + wonLeadsCount;
  const conversionRate = closedTotal > 0 ? Math.round((wonLeadsCount / closedTotal) * 100) : 0;
  const averageTicketInCents = openLeadsCount > 0 ? Math.round(openRevenueInCents / openLeadsCount) : 0;
  // Follow-ups vencidos/hoje e "últimos 7 dias" têm sentido fixo (agenda do
  // momento, janela própria) — não seguem o filtro de período. Os demais
  // indicadores refletem o intervalo escolhido, então o detalhe muda pra
  // não parecer "pipeline inteiro" quando na verdade está filtrado.
  const filterActive = Boolean(dateFrom && dateTo);
  const metrics = [
    { label: "Total de leads", value: String(totalCount), detail: filterActive ? "no período selecionado" : "no pipeline inteiro" },
    { label: "Leads abertos", value: String(openLeadsCount), detail: filterActive ? "em andamento, no período" : "em andamento no funil" },
    { label: "Fechados (ganhos)", value: String(wonLeadsCount), detail: filterActive ? "negócios ganhos no período" : "negócios ganhos" },
    { label: "Taxa de conversão", value: `${conversionRate}%`, detail: "ganhos / (abertos + ganhos)" },
    { label: "Receita no funil", value: currency(openRevenueInCents), detail: filterActive ? "valor em aberto, no período" : "valor em aberto" },
    { label: "Ticket médio", value: currency(averageTicketInCents), detail: "por lead em aberto" },
    { label: "Follow-ups vencidos", value: String(overdueFollowUpsCount), detail: "no pipeline inteiro" },
    { label: "Leads últimos 7 dias", value: String(leadsLast7Days), detail: "novos cadastros" }
  ];

  const funnelTotal = funnelData.reduce((sum, stage) => sum + stage.leadCount, 0);
  const funnelRows = funnelData.map((stage, index) => {
    const percentOfTotal = funnelTotal > 0 ? (stage.leadCount / funnelTotal) * 100 : 0;
    const previousStage = index > 0 ? funnelData[index - 1] : undefined;
    const conversionRateFromPrevious = previousStage && previousStage.leadCount > 0 ? (stage.leadCount / previousStage.leadCount) * 100 : null;
    return { stage, percentOfTotal, conversionRateFromPrevious };
  });

  return (
      <div className="content" id="dashboard">
          {feedback ? <div className={`feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</div> : null}
          <DashboardFilterBar currentFilters={{ dateFrom, dateTo }} />
          {(overdueFollowUpsCount > 0 || todayFollowUpsCount > 0) ? <section className="followup-alerts" aria-label="Alertas de follow-up">{overdueFollowUpsCount > 0 ? <div className="overdue"><strong>{overdueFollowUpsCount}</strong><span>follow-up{overdueFollowUpsCount === 1 ? "" : "s"} vencido{overdueFollowUpsCount === 1 ? "" : "s"}</span></div> : null}{todayFollowUpsCount > 0 ? <div className="today"><strong>{todayFollowUpsCount}</strong><span>follow-up{todayFollowUpsCount === 1 ? "" : "s"} para hoje</span></div> : null}</section> : null}
          <section className="metrics" aria-label="Indicadores comerciais">
            {metrics.map((metric) => <article className="metric" key={metric.label}><div><span>{metric.label}</span></div><strong>{metric.value}</strong><small><em>{metric.detail}</em></small></article>)}
          </section>

          <DashboardChartsLoader evolutionData={evolutionData} originData={originData} lossReasonData={lossReasonData} revenueData={revenueData} />

          <section className="funnel-section" aria-labelledby="funnel-section-title">
            <h3 id="funnel-section-title">Funil de conversão</h3>
            {funnelTotal > 0 ? (
              <div className="funnel-list">
                {funnelRows.map(({ stage, percentOfTotal, conversionRateFromPrevious }) => (
                  <div className="funnel-row" key={stage.stageId}>
                    <span className="funnel-row-label">{stage.stageName}</span>
                    <div className="funnel-bar-track"><div className={`funnel-bar-fill ${stageKind(stage)}`} style={{ width: `${percentOfTotal}%` }} /></div>
                    <div className="funnel-row-stats">
                      <strong>{stage.leadCount} {stage.leadCount === 1 ? "lead" : "leads"}</strong>
                      <span>{percentOfTotal.toFixed(1)}% do total{conversionRateFromPrevious !== null ? ` · ${conversionRateFromPrevious.toFixed(1)}% da anterior` : ""}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="chart-empty"><span>Sem dados suficientes ainda</span></div>
            )}
          </section>

          <section className="task-center" id="tasks" aria-labelledby="task-center-title">
            <div className="task-center-header"><div><p className="eyebrow">AGENDA COMERCIAL</p><h2 id="task-center-title">Tarefas pendentes</h2></div>{canSeeTeamTasks ? <nav aria-label="Escopo das tarefas"><a className={taskScope === "mine" ? "active" : ""} href="/app?tasks=mine">Minhas</a><a className={taskScope === "all" ? "active" : ""} href="/app?tasks=all">Equipe</a></nav> : null}</div>
            {tasks.length ? <div className="task-center-list">{tasks.map((task) => { const due = taskDueState(task.dueAt); return <Link href={`/app/leads/${task.leadId}`} className="task-center-item" key={task.id}><span className={`task-due-dot ${due.kind}`} /><div><strong>{task.title}</strong><small>{task.leadName}</small></div><time className={due.kind}>{due.label}</time></Link>; })}</div> : <div className="task-center-empty"><strong>Nenhuma tarefa pendente</strong><span>As próximas ações dos seus leads aparecerão aqui.</span></div>}
          </section>
      </div>
  );
}
