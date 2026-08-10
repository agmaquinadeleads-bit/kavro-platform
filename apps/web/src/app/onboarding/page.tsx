import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createOrganization } from "./actions";

type OnboardingPageProps = { searchParams: Promise<{ error?: string }> };

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (membership) redirect("/app");

  const { error } = await searchParams;
  return (
    <main className="centered-page">
      <section className="setup-card">
        <div className="setup-logo"><span>K</span>Kavro</div>
        <p className="eyebrow">PRIMEIROS PASSOS</p>
        <h1>Como se chama sua empresa?</h1>
        <p>Criaremos um espaço seguro e um pipeline comercial inicial para sua equipe.</p>
        {error ? <div className="login-error" role="alert">Não foi possível criar a organização. Verifique o nome e tente novamente.</div> : null}
        <form action={createOrganization}>
          <label htmlFor="organization_name">Nome da empresa</label>
          <input id="organization_name" name="organization_name" minLength={2} maxLength={120} required autoFocus placeholder="Ex.: Kavro Comercial" />
          <button type="submit">Criar meu espaço</button>
        </form>
        <small>Você será o proprietário e poderá convidar sua equipe depois.</small>
      </section>
    </main>
  );
}

