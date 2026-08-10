import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { acceptInvitation, createInvitedAccount } from "./actions";

type InvitePageProps = { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string; success?: string }> };

export default async function InvitePage({ params, searchParams }: InvitePageProps) {
  const { token } = await params;
  const feedback = await searchParams;
  const validToken = /^[a-f0-9]{64}$/.test(token);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const errorText = feedback.error === "accept_failed" ? "Não foi possível aceitar o convite. Confirme se você entrou com o mesmo e-mail convidado e se o link ainda está válido." : feedback.error ? "Revise os dados informados e tente novamente." : null;
  const successText = feedback.success === "check_email" ? "Enviamos uma confirmação para seu e-mail. Confirme e volte por este link." : feedback.success === "account_created" ? "Conta criada. Agora aceite o convite." : null;

  return <main className="centered-page"><section className="setup-card invite-accept-card"><div className="setup-logo"><span>K</span>Kavro</div><p className="eyebrow">CONVITE DE EQUIPE</p><h1>Entre para o Kavro</h1><p>O convite só poderá ser aceito pela conta que utiliza o mesmo e-mail informado pelo administrador.</p>
    {!validToken ? <div className="login-error">Este link de convite é inválido.</div> : null}
    {errorText ? <div className="login-error" role="alert">{errorText}</div> : null}{successText ? <div className="success-note" role="status">{successText}</div> : null}
    {validToken && user ? <form action={acceptInvitation}><input type="hidden" name="token" value={token} /><p className="signed-in-note">Conectado como <strong>{user.email}</strong></p><button type="submit">Aceitar convite</button></form> : validToken ? <>
      <Link className="invite-login-link" href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>Já tenho conta — entrar</Link>
      <div className="form-divider"><span>ou crie sua conta</span></div>
      <form action={createInvitedAccount}><input type="hidden" name="token" value={token} /><label>Nome completo</label><input name="full_name" required minLength={2} maxLength={120} /><label>E-mail convidado</label><input name="email" type="email" required /><label>Senha</label><input name="password" type="password" required minLength={8} maxLength={128} /><button type="submit">Criar conta</button></form>
    </> : null}
  </section></main>;
}
