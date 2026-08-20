import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";
import { cancelInvitation, changeMemberRole, createInvitation, removeMember } from "../team/actions";
import { createLeadSource, deleteLeadSource } from "../criativos/actions";

type ConfiguracoesPageProps = { searchParams: Promise<{ error?: string; success?: string; invitation?: string }> };

const errorMessages: Record<string, string> = {
  forbidden: "Seu perfil não pode fazer essa ação.",
  invalid_invitation: "Revise o e-mail e o perfil do convite.",
  invitation_failed: "Não foi possível criar o convite.",
  invitation_cancel_failed: "Não foi possível cancelar o convite.",
  invalid_role: "Perfil inválido.",
  role_change_failed: "Não foi possível alterar o perfil.",
  invalid_removal: "Seleção de usuário inválida.",
  member_removal_failed: "Não foi possível remover o usuário.",
  invalid_source: "Informe um nome de origem válido.",
  source_duplicate: "Já existe uma origem com esse nome.",
  source_create_failed: "Não foi possível criar a origem.",
  source_delete_failed: "Não foi possível remover a origem."
};
const successMessages: Record<string, string> = {
  invitation_created: "Convite criado. Copie o link abaixo e envie ao usuário.",
  invitation_cancelled: "Convite cancelado.",
  role_changed: "Perfil atualizado.",
  member_removed: "Usuário removido e registros redistribuídos com segurança.",
  source_created: "Origem criada.",
  source_deleted: "Origem removida."
};

export default async function ConfiguracoesPage({ searchParams }: ConfiguracoesPageProps) {
  const params = await searchParams;
  const { supabase, user, orgId, role } = await getAuthContext();
  if (role === "member") redirect("/app?error=forbidden");

  type ConnectionRow = { id: string; display_name: string; phone_number: string | null; provider: "evolution" | "whatsapp_cloud"; status: string };

  const [{ data: organization }, { data: members }, { data: invitations }, { data: sources }, { data: connections }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId).single(),
    supabase.from("organization_members").select("user_id, role, created_at, user_profiles(full_name, email)").eq("org_id", orgId).order("created_at"),
    supabase.from("organization_invitations").select("id, email, role, expires_at, created_at").eq("org_id", orgId).is("accepted_at", null).is("cancelled_at", null).order("created_at", { ascending: false }),
    supabase.from("lead_sources").select("id, name").eq("org_id", orgId).order("name"),
    supabase.from("whatsapp_connections").select("id, display_name, phone_number, provider, status").eq("org_id", orgId).order("created_at")
  ]);

  const sourceRows = sources ?? [];
  const connectionRows: ConnectionRow[] = connections ?? [];
  const memberRows = members ?? [];

  const errorMessage = params.error ? errorMessages[params.error] : undefined;
  const successMessage = params.success ? successMessages[params.success] : undefined;
  const feedback = errorMessage ? { kind: "error" as const, message: errorMessage } : successMessage ? { kind: "success" as const, message: successMessage } : undefined;

  const whatsappConnected = connectionRows.some((connection) => connection.status === "connected");
  const whatsappBadge = connectionRows.length === 0 ? "Não configurado" : whatsappConnected ? "Conectado" : "Configurando";
  const connectionStatusLabel = (status: string) => (status === "connected" ? "Conectado" : status === "connecting" ? "Configurando" : status === "qr_code" ? "Aguardando QR" : status === "error" ? "Precisa de atenção" : "Desconectado");

  return (
    <>
      <header className="topbar"><div><p>CONFIGURAÇÕES</p><h1>Configurações</h1></div></header>
      <div className="content" id="configuracoes">
        <p className="section-intro">Gerencie vendedores, origens, equipe e integrações.</p>

        {feedback ? <div className={`feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</div> : null}
        {params.invitation ? <div className="invite-link-box"><strong>Link do convite</strong><code>{`/invite/${params.invitation}`}</code><small>No ambiente publicado, o link usará automaticamente o domínio do Kavro.</small></div> : null}

        <div className="settings-blocks">
          <details className="settings-block">
            <summary>
              <span className="settings-block-icon" style={{ background: "#dbf5e6", color: "#168a55" }}>💬</span>
              <span className="settings-block-text"><strong>WhatsApp Business API</strong><small>Credenciais, conexão e status</small></span>
              <span className={`settings-block-badge ${whatsappConnected ? "positive" : ""}`}>{whatsappBadge}</span>
              <span className="settings-block-chevron" aria-hidden="true">▾</span>
            </summary>
            <div className="settings-block-body">
              {connectionRows.length ? (
                <div className="connection-list">
                  {connectionRows.map((connection) => (
                    <article key={connection.id}>
                      <div><strong>{connection.display_name}</strong><small>{connection.phone_number || "Telefone aguardando conexão"} · {connection.provider === "whatsapp_cloud" ? "Meta Oficial" : "QR Code"}</small></div>
                      <span className={connection.status}>{connectionStatusLabel(connection.status)}</span>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="settings-block-empty">Nenhum número conectado ainda.</p>
              )}
              <Link href="/app/whatsapp/settings" className="btn-secondary">Gerenciar conexão</Link>
            </div>
          </details>

          <details className="settings-block">
            <summary>
              <span className="settings-block-icon" style={{ background: "#e8f0fd", color: "#2857a6" }}>🌐</span>
              <span className="settings-block-text"><strong>Origens de lead</strong><small>De onde vêm seus leads</small></span>
              <span className="settings-block-badge positive">{sourceRows.length} {sourceRows.length === 1 ? "origem" : "origens"}</span>
              <span className="settings-block-chevron" aria-hidden="true">▾</span>
            </summary>
            <div className="settings-block-body">
              <div className="tag-pills">
                {sourceRows.map((source) => (
                  <span key={source.id} className="tag-pill source-pill">
                    {source.name}
                    <form action={deleteLeadSource} style={{ display: "contents" }}>
                      <input type="hidden" name="source_id" value={source.id} />
                      <button type="submit" className="tag-pill-remove" aria-label={`Remover origem ${source.name}`}>×</button>
                    </form>
                  </span>
                ))}
                {sourceRows.length === 0 ? <span className="tag-empty">Nenhuma origem cadastrada</span> : null}
              </div>
              <form action={createLeadSource} className="tag-add-form">
                <input type="text" name="name" placeholder="Nova origem" maxLength={60} required />
                <button type="submit">Adicionar</button>
              </form>
            </div>
          </details>

          <div className="settings-block settings-block-disabled">
            <div className="settings-block-summary-static">
              <span className="settings-block-icon" style={{ background: "#f3e8ff", color: "#7c3aed" }}>💳</span>
              <span className="settings-block-text"><strong>Planos e cobrança</strong><small>Veja o plano atual e o status da assinatura</small></span>
              <span className="settings-block-badge muted">Em breve</span>
            </div>
          </div>

          <div className="settings-block settings-block-disabled">
            <div className="settings-block-summary-static">
              <span className="settings-block-icon" style={{ background: "#e0edff", color: "#1d4ed8" }}>📊</span>
              <span className="settings-block-text"><strong>Meta Ads — Conversões</strong><small>Enviar evento de compra ao fechar vendas no CRM</small></span>
              <span className="settings-block-badge muted">Em breve</span>
            </div>
          </div>

          <div className="settings-block settings-block-disabled">
            <div className="settings-block-summary-static">
              <span className="settings-block-icon" style={{ background: "#fdeee0", color: "#b8531f" }}>📝</span>
              <span className="settings-block-text"><strong>Formulários de site</strong><small>Crie formulários e gere o embed para o site do cliente</small></span>
              <span className="settings-block-badge muted">Em breve</span>
            </div>
          </div>
        </div>

        <h2 className="settings-section-title">👥 Equipe — {organization?.name ?? "Organização"}</h2>
        <section className="team-grid">
          <article className="team-card">
            <h2>Novo convite</h2>
            <form className="invite-form" action={createInvitation}>
              <label>E-mail<input name="email" type="email" required placeholder="usuario@empresa.com.br" /></label>
              <label>Perfil<select name="role" defaultValue="member"><option value="member">Membro</option>{role === "owner" ? <option value="admin">Administrador</option> : null}</select></label>
              <button type="submit">Criar convite</button>
            </form>
          </article>
          <article className="team-card">
            <h2>Membros ativos</h2>
            <div className="member-list">
              {memberRows.map((member) => {
                const profile = Array.isArray(member.user_profiles) ? member.user_profiles[0] : member.user_profiles;
                const ownOrOwner = member.user_id === user.id || member.role === "owner";
                const canRemove = !ownOrOwner && (role === "owner" || member.role === "member");
                return (
                  <div className="member-row" key={member.user_id}>
                    <div><strong>{profile?.full_name || profile?.email || "Usuário"}</strong><small>{profile?.email}</small></div>
                    <div className="member-actions">
                      {role === "owner" && !ownOrOwner ? (
                        <form action={changeMemberRole}>
                          <input type="hidden" name="user_id" value={member.user_id} />
                          <select name="role" defaultValue={member.role}><option value="member">Membro</option><option value="admin">Administrador</option></select>
                          <button>Salvar</button>
                        </form>
                      ) : (
                        <span>{member.role === "owner" ? "Proprietário" : member.role === "admin" ? "Administrador" : "Membro"}</span>
                      )}
                      {canRemove ? (
                        <details className="remove-member">
                          <summary>Remover</summary>
                          <form action={removeMember}>
                            <input type="hidden" name="user_id" value={member.user_id} />
                            <label>
                              Redistribuir registros para
                              <select name="replacement_user_id" defaultValue="">
                                <option value="">Deixar sem responsável</option>
                                {memberRows.filter((candidate) => candidate.user_id !== member.user_id).map((candidate) => {
                                  const candidateProfile = Array.isArray(candidate.user_profiles) ? candidate.user_profiles[0] : candidate.user_profiles;
                                  return <option key={candidate.user_id} value={candidate.user_id}>{candidateProfile?.full_name || candidateProfile?.email || "Usuário"}</option>;
                                })}
                              </select>
                            </label>
                            <button className="danger-button">Confirmar remoção</button>
                          </form>
                        </details>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
          <article className="team-card invitations-card">
            <h2>Convites pendentes</h2>
            {invitations?.length ? (
              <div className="member-list">
                {invitations.map((invite) => (
                  <div className="member-row" key={invite.id}>
                    <div>
                      <strong>{invite.email}</strong>
                      <small>{invite.role === "admin" ? "Administrador" : "Membro"} · expira em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(invite.expires_at))}</small>
                      <code>{`/invite/${invite.id}`}</code>
                    </div>
                    <form action={cancelInvitation}>
                      <input type="hidden" name="invitation_id" value={invite.id} />
                      <button className="danger-button">Cancelar</button>
                    </form>
                  </div>
                ))}
              </div>
            ) : (
              <p className="team-empty">Nenhum convite pendente.</p>
            )}
          </article>
        </section>
      </div>
    </>
  );
}
