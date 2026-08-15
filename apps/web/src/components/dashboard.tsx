import Link from "next/link";
import type {
  DashboardEvolutionPoint,
  DashboardLossReasonPoint,
  DashboardOriginPoint,
  DashboardRevenuePoint
} from "./dashboard-charts";
import { DashboardChartsLoader } from "./dashboard-charts-loader";

// DashboardStage/DashboardLead continuam exportados daqui porque outros módulos
// (MoveLeadForm, /app/pipeline/page.tsx) dependem desses tipos, mesmo que o
// componente Dashboard não use mais stages/leads diretamente (movido pro Kanban).
export type DashboardStage = { id: string; name: string; position: number; isWon: boolean; isLost: boolean };
export type DashboardLead = { id: string; name: string; email: string | null; phone: string | null; source: string | null; stageId: string; valueInCents: number; version: number; followUpAt: string | null; createdAt: string };
export type DashboardTask = { id: string; leadId: string; leadName: string; title: string; dueAt: string | null; assignedTo: string | null; version: number };
export type { DashboardEvolutionPoint, DashboardOriginPoint, DashboardLossReasonPoint, DashboardRevenuePoint };

type DashboardProps = {
  userName: string;
  tasks: DashboardTask[];
  taskScope: "mine" | "all";
  canSeeTeamTasks: boolean;
  totalCount: number;
  feedback?: { kind: "error" | "success"; message: string };
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

export function Dashboard({ userName, tasks, taskScope, canSeeTeamTasks, totalCount, feedback, openLeadsCount, wonLeadsCount, openRevenueInCents, leadsLast7Days, overdueFollowUpsCount, todayFollowUpsCount, evolutionData, originData, lossReasonData, revenueData }: DashboardProps) {
  const closedTotal = openLeadsCount + wonLeadsCount;
  const conversionRate = closedTotal > 0 ? Math.round((wonLeadsCount / closedTotal) * 100) : 0;
  const averageTicketInCents = openLeadsCount > 0 ? Math.round(openRevenueInCents / openLeadsCount) : 0;
  const metrics = [
    { label: "Total de leads", value: String(totalCount), detail: "no pipeline inteiro" },
    { label: "Leads abertos", value: String(openLeadsCount), detail: "em andamento no funil" },
    { label: "Fechados (ganhos)", value: String(wonLeadsCount), detail: "negócios ganhos" },
    { label: "Taxa de conversão", value: `${conversionRate}%`, detail: "ganhos / (abertos + ganhos)" },
    { label: "Receita no funil", value: currency(openRevenueInCents), detail: "valor em aberto" },
    { label: "Ticket médio", value: currency(averageTicketInCents), detail: "por lead em aberto" },
    { label: "Follow-ups vencidos", value: String(overdueFollowUpsCount), detail: "no pipeline inteiro" },
    { label: "Leads últimos 7 dias", value: String(leadsLast7Days), detail: "novos cadastros" }
  ];

  return (
    <>
      <header className="topbar"><div><p>AMBIENTE DE HOMOLOGAÇÃO</p><h1>Olá, {userName}</h1></div><div className="top-actions"><a className="primary-link" href="/app/leads">+ Novo lead</a></div></header>
      <div className="content" id="dashboard">
          {feedback ? <div className={`feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</div> : null}
          {(overdueFollowUpsCount > 0 || todayFollowUpsCount > 0) ? <section className="followup-alerts" aria-label="Alertas de follow-up">{overdueFollowUpsCount > 0 ? <div className="overdue"><strong>{overdueFollowUpsCount}</strong><span>follow-up{overdueFollowUpsCount === 1 ? "" : "s"} vencido{overdueFollowUpsCount === 1 ? "" : "s"}</span></div> : null}{todayFollowUpsCount > 0 ? <div className="today"><strong>{todayFollowUpsCount}</strong><span>follow-up{todayFollowUpsCount === 1 ? "" : "s"} para hoje</span></div> : null}</section> : null}
          <section className="metrics" aria-label="Indicadores comerciais">
            {metrics.map((metric) => <article className="metric" key={metric.label}><div><span>{metric.label}</span></div><strong>{metric.value}</strong><small><em>{metric.detail}</em></small></article>)}
          </section>

          <DashboardChartsLoader evolutionData={evolutionData} originData={originData} lossReasonData={lossReasonData} revenueData={revenueData} />

          <section className="task-center" id="tasks" aria-labelledby="task-center-title">
            <div className="task-center-header"><div><p className="eyebrow">AGENDA COMERCIAL</p><h2 id="task-center-title">Tarefas pendentes</h2></div>{canSeeTeamTasks ? <nav aria-label="Escopo das tarefas"><a className={taskScope === "mine" ? "active" : ""} href="/app?tasks=mine">Minhas</a><a className={taskScope === "all" ? "active" : ""} href="/app?tasks=all">Equipe</a></nav> : null}</div>
            {tasks.length ? <div className="task-center-list">{tasks.map((task) => { const due = taskDueState(task.dueAt); return <Link href={`/app/leads/${task.leadId}`} className="task-center-item" key={task.id}><span className={`task-due-dot ${due.kind}`} /><div><strong>{task.title}</strong><small>{task.leadName}</small></div><time className={due.kind}>{due.label}</time></Link>; })}</div> : <div className="task-center-empty"><strong>Nenhuma tarefa pendente</strong><span>As próximas ações dos seus leads aparecerão aqui.</span></div>}
          </section>
        </div>
    </>
  );
}
