import Link from "next/link";
import { archiveLead, createLead, createStage, renameStage } from "@/app/app/actions";
import type { DashboardEvolutionPoint, DashboardOriginPoint } from "./dashboard-charts";
import { DashboardChartsLoader } from "./dashboard-charts-loader";
import { MoveLeadForm } from "./move-lead-form";

export type DashboardStage = { id: string; name: string; position: number; isWon: boolean; isLost: boolean };
export type DashboardLead = { id: string; name: string; email: string | null; phone: string | null; source: string | null; stageId: string; valueInCents: number; version: number; followUpAt: string | null; createdAt: string };
export type DashboardTask = { id: string; leadId: string; leadName: string; title: string; dueAt: string | null; assignedTo: string | null; version: number };
export type { DashboardEvolutionPoint, DashboardOriginPoint };

type DashboardProps = {
  userName: string;
  pipelineId: string | null;
  pipelineName: string;
  stages: DashboardStage[];
  leads: DashboardLead[];
  tasks: DashboardTask[];
  taskScope: "mine" | "all";
  canSeeTeamTasks: boolean;
  totalCount: number;
  currentPage: number;
  totalPages: number;
  filters: { search: string; stageId: string };
  feedback?: { kind: "error" | "success"; message: string };
  openLeadsCount: number;
  wonLeadsCount: number;
  openRevenueInCents: number;
  leadsLast7Days: number;
  overdueFollowUpsCount: number;
  evolutionData: DashboardEvolutionPoint[];
  originData: DashboardOriginPoint[];
};

function currency(valueInCents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valueInCents / 100); }
function followUpState(value: string | null) {
  if (!value) return null;
  const target = new Date(value);
  const now = new Date();
  const formatDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
  if (target.getTime() < now.getTime()) return { kind: "overdue", label: "Follow-up vencido" };
  if (formatDay.format(target) === formatDay.format(now)) return { kind: "today", label: "Follow-up hoje" };
  return { kind: "future", label: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(target) };
}

function taskDueState(value: string | null) {
  if (!value) return { kind: "no-date", label: "Sem prazo" };
  const date = new Date(value);
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
  if (date.getTime() < now.getTime()) return { kind: "overdue", label: `Atrasada · ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(date)}` };
  if (day.format(date) === day.format(now)) return { kind: "today", label: `Hoje · ${new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(date)}` };
  return { kind: "future", label: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(date) };
}

export function Dashboard({ userName, pipelineId, pipelineName, stages, leads, tasks, taskScope, canSeeTeamTasks, totalCount, currentPage, totalPages, filters, feedback, openLeadsCount, wonLeadsCount, openRevenueInCents, leadsLast7Days, overdueFollowUpsCount, evolutionData, originData }: DashboardProps) {
  const overdueCount = leads.filter((lead) => followUpState(lead.followUpAt)?.kind === "overdue").length;
  const todayCount = leads.filter((lead) => followUpState(lead.followUpAt)?.kind === "today").length;
  const firstStage = stages.find((stage) => !stage.isWon && !stage.isLost);
  const closedTotal = openLeadsCount + wonLeadsCount;
  const conversionRate = closedTotal > 0 ? Math.round((wonLeadsCount / closedTotal) * 100) : 0;
  const averageTicketInCents = openLeadsCount > 0 ? Math.round(openRevenueInCents / openLeadsCount) : 0;
  const metrics = [
    { label: "Total de leads", value: String(totalCount), detail: "resultado dos filtros" },
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
      <header className="topbar"><div><p>AMBIENTE DE HOMOLOGAÇÃO</p><h1>Olá, {userName}</h1></div><div className="top-actions"><a className="primary-link" href="#new-lead">+ Novo lead</a></div></header>
      <div className="content" id="dashboard">
          {feedback ? <div className={`feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</div> : null}
          {(overdueCount > 0 || todayCount > 0) ? <section className="followup-alerts" aria-label="Alertas de follow-up">{overdueCount > 0 ? <div className="overdue"><strong>{overdueCount}</strong><span>follow-up{overdueCount === 1 ? "" : "s"} vencido{overdueCount === 1 ? "" : "s"}</span></div> : null}{todayCount > 0 ? <div className="today"><strong>{todayCount}</strong><span>follow-up{todayCount === 1 ? "" : "s"} para hoje</span></div> : null}</section> : null}
          <section className="metrics" aria-label="Indicadores comerciais">
            {metrics.map((metric) => <article className="metric" key={metric.label}><div><span>{metric.label}</span></div><strong>{metric.value}</strong><small><em>{metric.detail}</em></small></article>)}
          </section>

          <DashboardChartsLoader evolutionData={evolutionData} originData={originData} />

          <section className="task-center" id="tasks" aria-labelledby="task-center-title">
            <div className="task-center-header"><div><p className="eyebrow">AGENDA COMERCIAL</p><h2 id="task-center-title">Tarefas pendentes</h2></div>{canSeeTeamTasks ? <nav aria-label="Escopo das tarefas"><a className={taskScope === "mine" ? "active" : ""} href="/app?tasks=mine">Minhas</a><a className={taskScope === "all" ? "active" : ""} href="/app?tasks=all">Equipe</a></nav> : null}</div>
            {tasks.length ? <div className="task-center-list">{tasks.map((task) => { const due = taskDueState(task.dueAt); return <Link href={`/app/leads/${task.leadId}`} className="task-center-item" key={task.id}><span className={`task-due-dot ${due.kind}`} /><div><strong>{task.title}</strong><small>{task.leadName}</small></div><time className={due.kind}>{due.label}</time></Link>; })}</div> : <div className="task-center-empty"><strong>Nenhuma tarefa pendente</strong><span>As próximas ações dos seus leads aparecerão aqui.</span></div>}
          </section>

          <form className="lead-filters" action="/app" method="get" aria-label="Filtrar leads">
            <label htmlFor="lead-search">Buscar</label><input id="lead-search" name="q" defaultValue={filters.search} placeholder="Nome, telefone ou origem" />
            <label htmlFor="stage-filter">Etapa</label><select id="stage-filter" name="stage" defaultValue={filters.stageId}><option value="">Todas as etapas</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select>
            <button type="submit">Aplicar filtros</button><a href="/app">Limpar</a>
          </form>

          <details className="pipeline-settings">
            <summary>Configurar etapas do pipeline</summary>
            <div className="pipeline-settings-grid">
              <form action={createStage}><h3>Nova etapa</h3><label>Nome<input name="name" required maxLength={100} /></label><label>Tipo<select name="kind" defaultValue="open"><option value="open">Em andamento</option><option value="won">Fechamento</option><option value="lost">Perda</option></select></label><button type="submit">Criar etapa</button></form>
              <div><h3>Renomear etapas</h3>{stages.map((stage) => <form className="rename-stage-form" action={renameStage} key={stage.id}><input type="hidden" name="stage_id" value={stage.id} /><input name="name" defaultValue={stage.name} required maxLength={100} aria-label={`Novo nome para ${stage.name}`} /><button type="submit">Salvar</button></form>)}</div>
            </div>
          </details>

          {pipelineId && firstStage ? (
            <section className="lead-create-panel" id="new-lead" aria-labelledby="new-lead-title">
              <div><p className="eyebrow">CADASTRO RÁPIDO</p><h2 id="new-lead-title">Novo lead</h2><p>Adicione uma oportunidade ao início do pipeline.</p></div>
              <form action={createLead}>
                <input type="hidden" name="pipeline_id" value={pipelineId} /><input type="hidden" name="stage_id" value={firstStage.id} />
                <label>Nome*<input name="name" required maxLength={160} placeholder="Nome ou empresa" /></label>
                <label>Telefone<input name="phone" maxLength={32} placeholder="(11) 99999-9999" /></label>
                <label>E-mail<input name="email" type="email" maxLength={254} placeholder="contato@empresa.com.br" /></label>
                <label>Origem<input name="source" maxLength={120} placeholder="Indicação, site, anúncio..." /></label>
                <label>Valor<input name="value" type="number" min="0" step="0.01" placeholder="0,00" /></label>
                <button type="submit">Adicionar lead</button>
              </form>
            </section>
          ) : <div className="feedback error" role="alert">Nenhum pipeline disponível para esta organização.</div>}

          <section className="pipeline-header" id="pipeline"><div><h2>{pipelineName}</h2><p>Dados reais do ambiente de homologação.</p></div><span>{totalCount} lead{totalCount === 1 ? "" : "s"}</span></section>
          {leads.length === 0 ? <section className="empty-state"><strong>Nenhum lead ainda</strong><p>Cadastre a primeira oportunidade usando o formulário acima.</p></section> : (
            <section className="kanban real-kanban" aria-label={`Pipeline ${pipelineName}`}>
              {stages.map((stage) => {
                const stageLeads = leads.filter((lead) => lead.stageId === stage.id);
                return <div className="column" key={stage.id}>
                  <header><div><i className={stage.isWon ? "green" : stage.isLost ? "red" : "blue"} /><strong>{stage.name}</strong><span>{stageLeads.length}</span></div></header>
                  <p>{currency(stageLeads.reduce((sum, lead) => sum + lead.valueInCents, 0))}</p>
                  <div className="card-list">{stageLeads.map((lead) => <article className="deal-card" key={lead.id}>
                    <div className="deal-type">{lead.source || "SEM ORIGEM"}</div><h3><Link href={`/app/leads/${lead.id}`}>{lead.name}</Link></h3><strong>{currency(lead.valueInCents)}</strong><p className="lead-contact">{lead.phone || lead.email || "Contato não informado"}</p>
                    {followUpState(lead.followUpAt) ? <span className={`followup-badge ${followUpState(lead.followUpAt)?.kind}`}>{followUpState(lead.followUpAt)?.label}</span> : null}
                    <MoveLeadForm leadId={lead.id} leadName={lead.name} version={lead.version} currentStageId={stage.id} stages={stages} />
                    <form action={archiveLead}><input type="hidden" name="lead_id" value={lead.id} /><input type="hidden" name="version" value={lead.version} /><button className="archive-button" type="submit" aria-label={`Arquivar ${lead.name}`}>Arquivar</button></form>
                  </article>)}</div>
                </div>;
              })}
            </section>
          )}
          {totalPages > 1 ? <nav className="pagination" aria-label="Paginação de leads"><a aria-disabled={currentPage <= 1} href={`/app?q=${encodeURIComponent(filters.search)}&stage=${encodeURIComponent(filters.stageId)}&page=${Math.max(1, currentPage - 1)}`}>← Anterior</a><span>Página {currentPage} de {totalPages}</span><a aria-disabled={currentPage >= totalPages} href={`/app?q=${encodeURIComponent(filters.search)}&stage=${encodeURIComponent(filters.stageId)}&page=${Math.min(totalPages, currentPage + 1)}`}>Próxima →</a></nav> : null}

          <section className="lead-table-section" aria-labelledby="lead-table-title"><div><h2 id="lead-table-title">Leads em tabela</h2><span>{leads.length} nesta página</span></div><div className="table-scroll"><table><caption>Leads filtrados do pipeline {pipelineName}</caption><thead><tr><th>Lead</th><th>Contato</th><th>Origem</th><th>Etapa</th><th>Follow-up</th><th>Valor</th><th>Ação</th></tr></thead><tbody>{leads.map((lead) => { const leadStage = stages.find((stage) => stage.id === lead.stageId); const followUp = followUpState(lead.followUpAt); return <tr key={lead.id}><td><strong>{lead.name}</strong><small>{lead.email}</small></td><td>{lead.phone || "—"}</td><td>{lead.source || "—"}</td><td><span className="table-stage">{leadStage?.name ?? "—"}</span></td><td>{followUp ? <span className={`followup-badge ${followUp.kind}`}>{followUp.label}</span> : "—"}</td><td>{currency(lead.valueInCents)}</td><td><Link href={`/app/leads/${lead.id}`}>Editar</Link></td></tr>; })}</tbody></table></div></section>
        </div>
    </>
  );
}
