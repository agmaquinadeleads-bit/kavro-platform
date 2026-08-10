import Link from "next/link";
import { login } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, next } = await searchParams;

  return (
    <main className="login-page">
      <section className="login-story">
        <Link className="login-brand" href="/"><span>K</span>Kavro</Link>
        <div>
          <p className="eyebrow">CRM CONVERSACIONAL</p>
          <h1>Organize seus leads.<br />Venda com clareza.</h1>
          <p>Um espaço simples para sua equipe conversar, acompanhar oportunidades e fechar mais negócios.</p>
          <ul>
            <li><b>✓</b> Pipeline visual e fácil de usar</li>
            <li><b>✓</b> Conversas e histórico no mesmo lugar</li>
            <li><b>✓</b> Indicadores para decisões melhores</li>
          </ul>
        </div>
        <small>© 2026 Kavro. Todos os direitos reservados.</small>
      </section>

      <section className="login-form-wrap">
        <form className="login-form" action={login}>
          <input type="hidden" name="next" value={next ?? ""} />
          <div className="mobile-brand"><span>K</span>Kavro</div>
          <p className="eyebrow">BEM-VINDO DE VOLTA</p>
          <h2>Acesse sua conta</h2>
          <p className="form-intro">Entre com os dados utilizados no cadastro.</p>

          {error ? <div className="login-error" role="alert">E-mail ou senha inválidos. Tente novamente.</div> : null}

          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" autoComplete="email" placeholder="voce@empresa.com.br" required />

          <div className="password-label"><label htmlFor="password">Senha</label><Link href="/forgot-password">Esqueci minha senha</Link></div>
          <input id="password" name="password" type="password" autoComplete="current-password" placeholder="••••••••" required />

          <button className="login-submit" type="submit">Entrar no Kavro</button>
          <p className="signup-copy">Ainda não tem uma conta? <a href="#cadastro">Começar período gratuito</a></p>
          <div className="security-note">🔒 Seus dados são protegidos e criptografados.</div>
        </form>
      </section>
    </main>
  );
}
