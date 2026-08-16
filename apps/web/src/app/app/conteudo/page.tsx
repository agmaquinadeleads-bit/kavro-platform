import Link from "next/link";
import { BrandIdentityButton } from "@/components/BrandIdentityButton";
import { NewBrandButton } from "@/components/NewBrandButton";
import { SocialConnectButton } from "@/components/SocialConnectButton";
import { getAuthContext } from "@/lib/auth-context";

type ConteudoPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

const errorMessages: Record<string, string> = {
  invalid_brand: "Informe um nome de marca válido.",
  forbidden: "Seu perfil não pode fazer essa ação.",
  brand_create_failed: "Não foi possível criar a marca.",
  invalid_identity: "Revise o texto de identidade visual.",
  identity_update_failed: "Não foi possível salvar a identidade visual."
};
const successMessages: Record<string, string> = {
  brand_created: "Marca criada com sucesso.",
  identity_updated: "Identidade visual salva."
};

const PROVIDER_LABELS: Record<string, string> = { instagram: "Instagram", facebook: "Facebook" };

export default async function ConteudoPage({ searchParams }: ConteudoPageProps) {
  const params = await searchParams;
  const { supabase, orgId } = await getAuthContext();

  type BrandRow = { id: string; name: string; visual_identity: string | null; created_at: string };
  type ConnectionRow = { id: string; brand_id: string; provider: "instagram" | "facebook"; external_account_name: string | null; status: string };
  type EditorialLineCountRow = { brand_id: string };

  const [{ data: brandRows }, { data: connectionRows }, { data: lineRows }] = await Promise.all([
    supabase.from("brands").select("id, name, visual_identity, created_at").eq("org_id", orgId).order("created_at", { ascending: true }),
    supabase.from("social_connections").select("id, brand_id, provider, external_account_name, status").eq("org_id", orgId),
    supabase.from("editorial_lines").select("brand_id").eq("org_id", orgId)
  ]);

  const brands: BrandRow[] = brandRows ?? [];
  const connections: ConnectionRow[] = connectionRows ?? [];
  const lineCountByBrand = new Map<string, number>();
  for (const row of (lineRows ?? []) as EditorialLineCountRow[]) {
    lineCountByBrand.set(row.brand_id, (lineCountByBrand.get(row.brand_id) ?? 0) + 1);
  }

  const errorMessage = params.error ? errorMessages[params.error] : undefined;
  const successMessage = params.success ? successMessages[params.success] : undefined;
  const feedback = errorMessage
    ? { kind: "error" as const, message: errorMessage }
    : successMessage
      ? { kind: "success" as const, message: successMessage }
      : undefined;

  return (
    <>
      <header className="topbar">
        <div><p>MÓDULO DE CONTEÚDO</p><h1>Marcas</h1></div>
        <div className="pipeline-actions">
          <NewBrandButton />
        </div>
      </header>
      <div className="content" id="conteudo">
        {feedback ? <div className={`feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</div> : null}

        {brands.length === 0 ? (
          <section className="empty-state">
            <strong>Nenhuma marca cadastrada</strong>
            <p>Crie uma marca pra começar a gerar linhas editoriais e conectar Instagram/Facebook.</p>
          </section>
        ) : (
          <div className="brand-grid">
            {brands.map((brand) => {
              const brandConnections = connections.filter((connection) => connection.brand_id === brand.id);
              return (
                <article key={brand.id} className="brand-card">
                  <div className="brand-card-header">
                    <h2>{brand.name}</h2>
                    <div className="brand-card-header-actions">
                      <BrandIdentityButton brandId={brand.id} brandName={brand.name} initialValue={brand.visual_identity ?? ""} />
                      <Link href={`/app/conteudo/${brand.id}`} className="btn-secondary">Linha editorial →</Link>
                    </div>
                  </div>

                  <div className="brand-card-connections">
                    {brandConnections.length > 0 ? (
                      <ul>
                        {brandConnections.map((connection) => (
                          <li key={connection.id}>
                            <span className={`connection-dot ${connection.status}`} />
                            {PROVIDER_LABELS[connection.provider] ?? connection.provider}
                            {connection.external_account_name ? ` — ${connection.external_account_name}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="brand-card-no-connection">Nenhuma rede social conectada ainda.</p>
                    )}
                    <SocialConnectButton brandId={brand.id} />
                  </div>

                  <p className="brand-card-lines-count">
                    {lineCountByBrand.get(brand.id) ?? 0} linha{lineCountByBrand.get(brand.id) === 1 ? "" : "s"} editorial{lineCountByBrand.get(brand.id) === 1 ? "" : "is"}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
