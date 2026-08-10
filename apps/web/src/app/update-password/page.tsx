import { updatePassword } from "./actions";

type UpdatePasswordPageProps = { searchParams: Promise<{ error?: string }> };

export default async function UpdatePasswordPage({ searchParams }: UpdatePasswordPageProps) {
  const { error } = await searchParams;
  return (
    <main className="centered-page">
      <section className="setup-card">
        <div className="setup-logo"><span>K</span>Kavro</div>
        <p className="eyebrow">NOVA SENHA</p>
        <h1>Proteja sua conta</h1>
        <p>Use pelo menos 10 caracteres e evite senhas utilizadas em outros serviços.</p>
        {error ? <div className="login-error" role="alert">As senhas não conferem ou não atendem aos requisitos.</div> : null}
        <form action={updatePassword}>
          <label htmlFor="password">Nova senha</label>
          <input id="password" name="password" type="password" minLength={10} maxLength={128} autoComplete="new-password" required />
          <label htmlFor="password_confirmation">Confirmar nova senha</label>
          <input id="password_confirmation" name="password_confirmation" type="password" minLength={10} maxLength={128} autoComplete="new-password" required />
          <button type="submit">Salvar nova senha</button>
        </form>
      </section>
    </main>
  );
}

