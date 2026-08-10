import Link from "next/link";
import { requestPasswordReset } from "./actions";

type ForgotPasswordPageProps = { searchParams: Promise<{ sent?: string }> };

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const { sent } = await searchParams;
  return (
    <main className="centered-page">
      <section className="setup-card">
        <div className="setup-logo"><span>K</span>Kavro</div>
        <p className="eyebrow">RECUPERAR ACESSO</p>
        <h1>Redefina sua senha</h1>
        <p>Informe seu e-mail. Se a conta existir, enviaremos as instruções de recuperação.</p>
        {sent ? <div className="success-note" role="status">Se o e-mail estiver cadastrado, você receberá uma mensagem em alguns minutos.</div> : null}
        <form action={requestPasswordReset}>
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" autoComplete="email" required placeholder="voce@empresa.com.br" />
          <button type="submit">Enviar instruções</button>
        </form>
        <Link className="back-link" href="/login">← Voltar ao login</Link>
      </section>
    </main>
  );
}

