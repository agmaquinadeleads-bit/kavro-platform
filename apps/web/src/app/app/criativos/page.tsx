import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";
import { createAdCreative, deleteAdCreative, updateAdCreative } from "./actions";

type CriativosPageProps = {
  searchParams: Promise<{ error?: string; success?: string; edit?: string }>;
};

const errorMessages: Record<string, string> = {
  forbidden: "Seu perfil não pode fazer essa ação.",
  invalid_creative: "Revise os dados do criativo.",
  creative_duplicate_message: "Já existe um criativo com essa mensagem inicial.",
  creative_create_failed: "Não foi possível criar o criativo.",
  creative_update_failed: "Não foi possível salvar o criativo.",
  creative_delete_failed: "Não foi possível remover o criativo.",
  invalid_image: "A imagem precisa ser JPG, PNG ou GIF.",
  image_too_large: "Imagem maior que 5MB — escolha uma menor.",
  image_upload_failed: "Não foi possível enviar a imagem."
};
const successMessages: Record<string, string> = {
  creative_created: "Criativo cadastrado.",
  creative_updated: "Criativo atualizado.",
  creative_deleted: "Criativo removido."
};

export default async function CriativosPage({ searchParams }: CriativosPageProps) {
  const params = await searchParams;
  const { supabase, orgId, role } = await getAuthContext();
  if (role === "member") redirect("/app");

  type SourceRow = { id: string; name: string };
  type CreativeRow = { id: string; name: string; source_id: string | null; initial_message: string; image_object_key: string | null; created_at: string };

  const [{ data: sourceRows }, { data: creativeRows }] = await Promise.all([
    supabase.from("lead_sources").select("id, name").eq("org_id", orgId).order("name"),
    supabase.from("ad_creatives").select("id, name, source_id, initial_message, image_object_key, created_at").eq("org_id", orgId).order("created_at", { ascending: false })
  ]);

  const sources: SourceRow[] = sourceRows ?? [];
  const creatives: CreativeRow[] = creativeRows ?? [];
  const sourceNameById = new Map(sources.map((source) => [source.id, source.name]));
  const imageUrl = (objectKey: string) => supabase.storage.from("ad-creative-images").getPublicUrl(objectKey).data.publicUrl;

  const editingCreative = params.edit ? creatives.find((creative) => creative.id === params.edit) : undefined;

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
        <div><p>ATRIBUIÇÃO DE LEADS</p><h1>Criativos</h1></div>
      </header>
      <div className="content" id="criativos">
        <p className="section-intro">Gerencie os criativos e mensagens de entrada dos anúncios. Quando um lead chega no WhatsApp com a mensagem inicial cadastrada aqui, o CRM já registra a origem certa automaticamente.</p>

        {feedback ? <div className={`feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</div> : null}

        <section className="creative-form-card">
          <h2>{editingCreative ? "Editar criativo" : "Novo criativo"}</h2>
          <form action={editingCreative ? updateAdCreative : createAdCreative} className="creative-form" encType="multipart/form-data">
            {editingCreative ? <input type="hidden" name="id" value={editingCreative.id} /> : null}
            <div className="creative-form-grid">
              <label>
                Nome do criativo
                <input type="text" name="name" defaultValue={editingCreative?.name ?? ""} maxLength={160} required />
              </label>
              <label>
                Origem
                <select name="source_id" defaultValue={editingCreative?.source_id ?? ""}>
                  <option value="">Sem origem</option>
                  {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
                </select>
                <small>Gerencie as origens em <Link href="/app/configuracoes">Configurações</Link>.</small>
              </label>
            </div>
            <label>
              Mensagem inicial que o lead manda
              <textarea name="initial_message" defaultValue={editingCreative?.initial_message ?? ""} maxLength={4000} rows={3} required />
            </label>
            <label>
              Imagem do criativo (opcional)
              <span className="creative-image-picker">
                {editingCreative?.image_object_key ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl(editingCreative.image_object_key)} alt="" className="creative-image-preview" />
                ) : null}
                <input type="file" name="image" accept="image/jpeg,image/png,image/gif" />
                <small>JPG, PNG ou GIF · máx 5MB{editingCreative?.image_object_key ? " · escolha um arquivo pra trocar a imagem atual" : ""}</small>
              </span>
            </label>
            <div className="creative-form-actions">
              <button type="submit" className="btn-primary">{editingCreative ? "Salvar alterações" : "Cadastrar criativo"}</button>
              {editingCreative ? <Link href="/app/criativos" className="btn-secondary">Cancelar</Link> : null}
            </div>
          </form>
        </section>

        {creatives.length === 0 ? (
          <section className="empty-state">
            <strong>Nenhum criativo cadastrado</strong>
            <p>Cadastre a mensagem inicial de cada anúncio pra identificar automaticamente de onde vem cada lead.</p>
          </section>
        ) : (
          <div className="creative-list">
            {creatives.map((creative) => (
              <article key={creative.id} className="creative-list-item">
                {creative.image_object_key ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl(creative.image_object_key)} alt="" className="creative-list-thumb" />
                ) : <div className="creative-list-thumb creative-list-thumb-empty" aria-hidden="true">🖼️</div>}
                <div className="creative-list-body">
                  <div className="creative-list-title">
                    <strong>{creative.name}</strong>
                    {creative.source_id ? <span className="source-badge">{sourceNameById.get(creative.source_id) ?? "Origem removida"}</span> : null}
                  </div>
                  <p>&quot;{creative.initial_message}&quot;</p>
                </div>
                <div className="creative-list-actions">
                  <Link href={`/app/criativos?edit=${creative.id}`} className="btn-secondary">Editar</Link>
                  <form action={deleteAdCreative}>
                    <input type="hidden" name="creative_id" value={creative.id} />
                    <button type="submit" className="link-button danger">Remover</button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
