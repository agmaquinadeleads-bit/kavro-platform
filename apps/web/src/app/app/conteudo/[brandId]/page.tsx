import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";

type BrandCalendarPageProps = {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<{ year?: string; error?: string; success?: string }>;
};

const errorMessages: Record<string, string> = {
  invalid_line: "Revise o nome e o briefing da linha editorial.",
  brand_missing: "Marca não encontrada.",
  line_create_failed: "Não foi possível criar a linha editorial.",
  ai_generation_failed: "A IA não conseguiu gerar a pauta. Tente reduzir a quantidade de posts ou simplificar o briefing.",
  posts_create_failed: "A linha foi criada, mas não foi possível salvar os posts gerados.",
  forbidden: "Seu perfil não pode fazer essa ação.",
  line_approve_failed: "Não foi possível aprovar a linha editorial.",
  invalid_post: "Post não encontrado.",
  missing_image_prompt: "Esse post não tem uma descrição de imagem gerada pela IA.",
  image_ai_not_configured: "Geração de imagem ainda não configurada nesse ambiente (falta OPENAI_API_KEY).",
  image_generation_failed: "Não foi possível gerar a imagem. Tente novamente.",
  post_approve_failed: "Não foi possível aprovar o post.",
  line_not_draft: "Só é possível excluir linhas ainda em rascunho.",
  line_delete_failed: "Não foi possível excluir a linha editorial.",
  invalid_schedule: "Selecione ao menos uma rede e uma data válida.",
  invalid_schedule_date: "A data de agendamento precisa ser no futuro.",
  missing_image: "Gere a imagem do post antes de agendar.",
  provider_not_connected: "Uma das redes escolhidas não está conectada pra essa marca.",
  schedule_failed: "Não foi possível agendar o post."
};

const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export default async function BrandCalendarPage({ params, searchParams }: BrandCalendarPageProps) {
  const { brandId } = await params;
  const search = await searchParams;
  const { supabase, orgId } = await getAuthContext();

  const { data: brand } = await supabase.from("brands").select("id, name").eq("id", brandId).eq("org_id", orgId).maybeSingle();
  if (!brand) notFound();

  const currentYear = new Date().getFullYear();
  const year = Number(search.year) && Number(search.year) >= 2000 && Number(search.year) <= 2100 ? Number(search.year) : currentYear;

  type EditorialLineRow = { id: string; target_month: string };
  type ContentPostRow = { editorial_line_id: string | null };

  const [{ data: lineRows }, { data: postRows }] = await Promise.all([
    supabase.from("editorial_lines").select("id, target_month").eq("org_id", orgId).eq("brand_id", brandId),
    supabase.from("content_posts").select("editorial_line_id").eq("org_id", orgId).eq("brand_id", brandId)
  ]);

  const lines: EditorialLineRow[] = lineRows ?? [];
  const posts: ContentPostRow[] = postRows ?? [];

  const monthOfLine = new Map<string, string>();
  const lineCountByMonth = new Map<string, number>();
  for (const line of lines) {
    const monthKey = line.target_month.slice(0, 7);
    monthOfLine.set(line.id, monthKey);
    lineCountByMonth.set(monthKey, (lineCountByMonth.get(monthKey) ?? 0) + 1);
  }

  const postCountByMonth = new Map<string, number>();
  for (const post of posts) {
    if (!post.editorial_line_id) continue;
    const monthKey = monthOfLine.get(post.editorial_line_id);
    if (!monthKey) continue;
    postCountByMonth.set(monthKey, (postCountByMonth.get(monthKey) ?? 0) + 1);
  }

  const errorMessage = search.error ? errorMessages[search.error] : undefined;

  return (
    <>
      <header className="topbar">
        <div><p>MÓDULO DE CONTEÚDO</p><h1>{brand.name}</h1></div>
        <div className="pipeline-actions">
          <Link href="/app/conteudo" className="btn-secondary">← Marcas</Link>
        </div>
      </header>
      <div className="content" id="conteudo-brand-calendar">
        {errorMessage ? <div className="feedback error" role="alert">{errorMessage}</div> : null}

        <div className="calendar-year-nav">
          <Link href={`/app/conteudo/${brand.id}?year=${year - 1}`} className="btn-secondary" aria-label="Ano anterior">‹</Link>
          <h2>{year}</h2>
          <Link href={`/app/conteudo/${brand.id}?year=${year + 1}`} className="btn-secondary" aria-label="Próximo ano">›</Link>
        </div>

        <div className="calendar-month-grid">
          {MONTH_LABELS.map((label, index) => {
            const monthNumber = index + 1;
            const monthKey = `${year}-${String(monthNumber).padStart(2, "0")}`;
            const lineCount = lineCountByMonth.get(monthKey) ?? 0;
            const postCount = postCountByMonth.get(monthKey) ?? 0;
            const isCurrentMonth = monthKey === `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
            return (
              <Link
                key={monthKey}
                href={`/app/conteudo/${brand.id}/${year}/${String(monthNumber).padStart(2, "0")}`}
                className={`calendar-month-card${isCurrentMonth ? " current" : ""}${lineCount > 0 ? " has-content" : ""}`}
              >
                <h3>{label}</h3>
                {lineCount > 0 ? (
                  <p>{lineCount} linha{lineCount === 1 ? "" : "s"} · {postCount} post{postCount === 1 ? "" : "s"}</p>
                ) : (
                  <p className="calendar-month-empty">Sem conteúdo</p>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
