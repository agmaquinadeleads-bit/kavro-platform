import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cancelInvitation, changeMemberRole, createInvitation, removeMember } from "./actions";

type TeamPageProps = { searchParams: Promise<{ error?: string; success?: string; invitation?: string }> };
const errors: Record<string, string> = { invalid_invitation: "Revise o e-mail e o perfil do convite.", invitation_failed: "Não foi possível criar o convite.", invitation_cancel_failed: "Não foi possível cancelar o convite.", invalid_role: "Perfil inválido.", role_change_failed: "Não foi possível alterar o perfil.", invalid_removal: "Seleção de usuário inválida.", member_removal_failed: "Não foi possível remover o usuário. Confirme se a migração 0008 foi aplicada." };
const successes: Record<string, string> = { invitation_created: "Convite criado. Copie o link abaixo e envie ao usuário.", invitation_cancelled: "Convite cancelado.", role_changed: "Perfil atualizado.", member_removed: "Usuário removido e registros redistribuídos com segurança." };

export default async function TeamPage({ searchParams }: TeamPageProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/team");
  const { data: membership } = await supabase.from("organization_members").select("org_id, role").eq("user_id", user.id).maybeSingle();
  if (!membership) redirect("/onboarding");
  if (membership.role === "member") redirect("/app?error=forbidden");
  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase.from("organization_members").select("user_id, role, created_at, user_profiles(full_name, email)").eq("org_id", membership.org_id).order("created_at"),
    supabase.from("organization_invitations").select("id, email, role, expires_at, created_at").eq("org_id", membership.org_id).is("accepted_at", null).is("cancelled_at", null).order("created_at", { ascending: false })
  ]);
  const params = await searchParams;
  const feedback = params.error ? { kind: "error", text: errors[params.error] ?? "Não foi possível concluir a ação." } : params.success ? { kind: "success", text: successes[params.success] ?? "Ação concluída." } : null;

  return <main className="team-page"><div className="team-shell">
    <header className="team-header"><div><Link href="/app">← Voltar ao painel</Link><p className="eyebrow">CONFIGURAÇÕES</p><h1>Equipe</h1><p>Convide usuários e controle o nível de acesso ao Kavro.</p></div></header>
    {feedback ? <div className={`feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.text}</div> : null}
    {params.invitation ? <div className="invite-link-box"><strong>Link do convite</strong><code>{`/invite/${params.invitation}`}</code><small>No ambiente publicado, o link usará automaticamente o domínio do Kavro.</small></div> : null}
    <section className="team-grid">
      <article className="team-card"><h2>Novo convite</h2><form className="invite-form" action={createInvitation}><label>E-mail<input name="email" type="email" required placeholder="usuario@empresa.com.br" /></label><label>Perfil<select name="role" defaultValue="member"><option value="member">Membro</option>{membership.role === "owner" ? <option value="admin">Administrador</option> : null}</select></label><button type="submit">Criar convite</button></form></article>
      <article className="team-card"><h2>Membros ativos</h2><div className="member-list">{(members ?? []).map((member) => { const profile = Array.isArray(member.user_profiles) ? member.user_profiles[0] : member.user_profiles; const ownOrOwner = member.user_id === user.id || member.role === "owner"; const canRemove = !ownOrOwner && (membership.role === "owner" || member.role === "member"); return <div className="member-row" key={member.user_id}><div><strong>{profile?.full_name || profile?.email || "Usuário"}</strong><small>{profile?.email}</small></div><div className="member-actions">{membership.role === "owner" && !ownOrOwner ? <form action={changeMemberRole}><input type="hidden" name="user_id" value={member.user_id} /><select name="role" defaultValue={member.role}><option value="member">Membro</option><option value="admin">Administrador</option></select><button>Salvar</button></form> : <span>{member.role === "owner" ? "Proprietário" : member.role === "admin" ? "Administrador" : "Membro"}</span>}{canRemove ? <details className="remove-member"><summary>Remover</summary><form action={removeMember}><input type="hidden" name="user_id" value={member.user_id} /><label>Redistribuir registros para<select name="replacement_user_id" defaultValue=""><option value="">Deixar sem responsável</option>{(members ?? []).filter((candidate) => candidate.user_id !== member.user_id).map((candidate) => { const candidateProfile = Array.isArray(candidate.user_profiles) ? candidate.user_profiles[0] : candidate.user_profiles; return <option key={candidate.user_id} value={candidate.user_id}>{candidateProfile?.full_name || candidateProfile?.email || "Usuário"}</option>; })}</select></label><button className="danger-button">Confirmar remoção</button></form></details> : null}</div></div>; })}</div></article>
      <article className="team-card invitations-card"><h2>Convites pendentes</h2>{invitations?.length ? <div className="member-list">{invitations.map((invite) => <div className="member-row" key={invite.id}><div><strong>{invite.email}</strong><small>{invite.role === "admin" ? "Administrador" : "Membro"} · expira em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(invite.expires_at))}</small><code>{`/invite/${invite.id}`}</code></div><form action={cancelInvitation}><input type="hidden" name="invitation_id" value={invite.id} /><button className="danger-button">Cancelar</button></form></div>)}</div> : <p className="team-empty">Nenhum convite pendente.</p>}</article>
    </section>
  </div></main>;
}
