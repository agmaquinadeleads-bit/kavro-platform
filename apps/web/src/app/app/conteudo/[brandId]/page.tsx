import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";
import { approveEditorialLine, approvePost, generateEditorialLine, generatePostImage, schedulePost } from "./actions";

type BrandDetailPageProps = {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<{ error?: string; success?: string; line?: string }>;
};

const errorMessages: Record<string, string> = {
  invalid_line: "Revise o nome e o briefing da linha editorial.",
  brand_missing: "Marca não encontrada.",
  line_create_failed: "Não foi possível criar a linha editorial.",
  ai_generation_failed: "A IA não conseguiu gerar a pauta. Tente reduzir a quantidade de posts ou simplificar o briefing.",
  posts_create_failed: "A linha foi criada, mas não foi possível salvar os posts gerados.",
  forbidden: "Seu perfil não pode aprovar conteúdo.",
  line_approve_failed: "Não foi possível aprovar a linha editorial.",
  invalid_post: "Post não encontrado.",
  missing_image_prompt: "Esse post não tem uma descrição de imagem gerada pela IA.",
  image_ai_not_configured: "Geração de imagem ainda não configurada nesse ambiente (falta OPENAI_API_KEY).",
  image_generation_failed: "Não foi possível gerar a imagem. Tente novamente.",
  post_approve_failed: "Não foi possível aprovar o post.",
  invalid_schedule: "Selecione ao menos uma rede e uma data válida.",
  invalid_schedule_date: "A data de agendamento precisa ser no futuro.",
  missing_image: "Gere a imagem do post antes de agendar.",
  provider_not_connected: "Uma das redes escolhidas não está conectada pra essa marca.",
  schedule_failed: "Não foi possível agendar o post."
};
const successMessages: Record<string, string> = {
  line_generated: "Linha editorial gerada com sucesso — revise os posts abaixo.",
  line_approved: "Linha editorial aprovada.",
  image_generated: "Imagem gerada com sucesso.",
  post_approved: "Post aprovado.",
  post_scheduled: "Post agendado — a publicação acontece automaticamente no horário escolhido."
};

const LINE_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  pending_approval: "Aguardando aprovação",
  approved: "Aprovada",
  archived: "Arquivada"
};

const POST_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  pending_approval: "Aguardando aprovação",
  approved: "Aprovado — pronto pra agendar",
  scheduled: "Agendado",
  publishing: "Publicando...",
  published: "Publicado",
  failed: "Falha na publicação"
};

const PROVIDER_LABELS: Record<string, string> = { instagram: "Instagram", facebook: "Facebook" };

export default async function BrandDetailPage({ params, searchParams }: BrandDetailPageProps) {
  const { brandId } = await params;
  const search = await searchParams;
  const { supabase, orgId } = await getAuthContext();

  const { data: brand } = await supabase.from("brands").select("id, name").eq("id", brandId).eq("org_id", orgId).maybeSingle();
  if (!brand) notFound();

  type EditorialLineRow = { id: string; name: string; theme: string | null; status: string; created_at: string };
  type ContentPostRow = {
    id: string;
    editorial_line_id: string | null;
    caption: string | null;
    status: string;
    image_url: string | null;
    scheduled_at: string | null;
    target_providers: string[];
  };
  type ConnectionRow = { provider: "instagram" | "facebook" };

  const [{ data: lineRows }, { data: postRows }, { data: connectionRows }] = await Promise.all([
    supabase.from("editorial_lines").select("id, name, theme, status, created_at").eq("org_id", orgId).eq("brand_id", brandId).order("created_at", { ascending: false }),
    supabase.from("content_posts").select("id, editorial_line_id, caption, status, image_url, scheduled_at, target_providers").eq("org_id", orgId).eq("brand_id", brandId),
    supabase.from("social_connections").select("provider").eq("org_id", orgId).eq("brand_id", brandId).eq("status", "connected")
  ]);

  const lines: EditorialLineRow[] = lineRows ?? [];
  const posts: ContentPostRow[] = postRows ?? [];
  const connectedProviders: string[] = ((connectionRows ?? []) as ConnectionRow[]).map((connection) => connection.provider);
  const postsByLine = new Map<string, ContentPostRow[]>();
  for (const post of posts) {
    if (!post.editorial_line_id) continue;
    const list = postsByLine.get(post.editorial_line_id) ?? [];
    list.push(post);
    postsByLine.set(post.editorial_line_id, list);
  }

  const errorMessage = search.error ? errorMessages[search.error] : undefined;
  const successMessage = search.success ? successMessages[search.success] : undefined;
  const feedback = errorMessage
    ? { kind: "error" as const, message: errorMessage }
    : successMessage
      ? { kind: "success" as const, message: successMessage }
      : undefined;

  return (
    <>
      <header className="topbar">
        <div><p>MÓDULO DE CONTEÚDO</p><h1>{brand.name}</h1></div>
        <div className="pipeline-actions">
          <Link href="/app/conteudo" className="btn-secondary">← Marcas</Link>
        </div>
      </header>
      <div className="content" id="conteudo-brand">
        {feedback ? <div className={`feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</div> : null}

        {connectedProviders.length === 0 ? (
          <div className="feedback error" role="alert">Conecte o Instagram e/ou Facebook dessa marca (na tela de Marcas) antes de agendar publicações.</div>
        ) : null}

        <section className="editorial-generate-panel">
          <h2>Nova linha editorial</h2>
          <p>Descreva o briefing (tom, produtos, objetivo, período) e a IA gera as ideias de post — cada uma vira um rascunho pra você revisar antes de aprovar.</p>
          <form action={generateEditorialLine} className="editorial-generate-form">
            <input type="hidden" name="brand_id" value={brand.id} />
            <label>Nome da linha*<input name="name" required maxLength={160} placeholder="Ex: Campanha de setembro" /></label>
            <label>Quantidade de posts<input name="post_count" type="number" min={1} max={20} defaultValue={6} /></label>
            <label className="full-field">
              Briefing*
              <textarea name="theme" required maxLength={4000} rows={4} placeholder="Ex: Loja de roupas femininas, tom descontraído e próximo, foco em promoções de fim de verão, sempre com CTA pro link da bio." />
            </label>
            <button type="submit">Gerar com IA</button>
          </form>
        </section>

        {lines.length === 0 ? (
          <section className="empty-state">
            <strong>Nenhuma linha editorial ainda</strong>
            <p>Use o formulário acima pra gerar a primeira.</p>
          </section>
        ) : (
          <div className="editorial-lines-list">
            {lines.map((line) => {
              const linePosts = postsByLine.get(line.id) ?? [];
              const lineApproved = line.status === "approved";
              return (
                <article key={line.id} className="editorial-line-card">
                  <div className="editorial-line-header">
                    <div>
                      <h3>{line.name}</h3>
                      <span className={`line-status-badge ${line.status}`}>{LINE_STATUS_LABELS[line.status] ?? line.status}</span>
                    </div>
                    {line.status === "draft" ? (
                      <form action={approveEditorialLine}>
                        <input type="hidden" name="line_id" value={line.id} />
                        <input type="hidden" name="brand_id" value={brand.id} />
                        <button type="submit" className="btn-primary">Aprovar linha</button>
                      </form>
                    ) : null}
                  </div>
                  {line.theme ? <p className="editorial-line-theme">{line.theme}</p> : null}

                  <div className="editorial-post-list">
                    {linePosts.map((post) => (
                      <div key={post.id} className="editorial-post-item">
                        <div className="editorial-post-main">
                          <p>{post.caption}</p>
                          <span className={`post-status-badge ${post.status}`}>{POST_STATUS_LABELS[post.status] ?? post.status}</span>
                        </div>

                        {post.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={post.image_url} alt="" className="editorial-post-image" />
                        ) : null}

                        {lineApproved && post.status === "draft" ? (
                          <div className="editorial-post-actions">
                            {!post.image_url ? (
                              <form action={generatePostImage}>
                                <input type="hidden" name="post_id" value={post.id} />
                                <input type="hidden" name="brand_id" value={brand.id} />
                                <button type="submit" className="btn-secondary">Gerar imagem</button>
                              </form>
                            ) : (
                              <form action={approvePost}>
                                <input type="hidden" name="post_id" value={post.id} />
                                <input type="hidden" name="brand_id" value={brand.id} />
                                <button type="submit" className="btn-primary">Aprovar post</button>
                              </form>
                            )}
                          </div>
                        ) : null}

                        {post.status === "approved" && connectedProviders.length > 0 ? (
                          <form action={schedulePost} className="post-schedule-form">
                            <input type="hidden" name="post_id" value={post.id} />
                            <input type="hidden" name="brand_id" value={brand.id} />
                            <label>
                              Publicar em
                              <input type="datetime-local" name="scheduled_at" required />
                            </label>
                            <div className="post-schedule-providers">
                              {connectedProviders.map((provider) => (
                                <label key={provider}>
                                  <input type="checkbox" name="providers" value={provider} defaultChecked />
                                  {PROVIDER_LABELS[provider] ?? provider}
                                </label>
                              ))}
                            </div>
                            <button type="submit" className="btn-primary">Agendar publicação</button>
                          </form>
                        ) : null}

                        {post.status === "scheduled" && post.scheduled_at ? (
                          <p className="editorial-post-schedule-info">
                            Agendado pra {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(post.scheduled_at))}
                            {" · "}
                            {post.target_providers.map((provider) => PROVIDER_LABELS[provider] ?? provider).join(", ")}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
