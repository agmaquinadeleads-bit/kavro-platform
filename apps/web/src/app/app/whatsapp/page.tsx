import Link from "next/link";
import { getAuthContext } from "@/lib/auth-context";
import { SubmitButton } from "@/components/SubmitButton";
import { ChatComposerInput } from "@/components/ChatComposerInput";
import { ChatAutoRefresh } from "@/components/ChatAutoRefresh";
import { MarkUnreadButton } from "@/components/MarkUnreadButton";
import { InboxFilterForm } from "@/components/InboxFilterForm";
import { ExportChatButton } from "@/components/ExportChatButton";
import { sendWhatsappMessage } from "./actions";

type WhatsappPageProps = { searchParams: Promise<{ conversation?: string; connection?: string; error?: string; success?: string; tab?: string; stage?: string; source?: string; q?: string }> };

const errorMessages: Record<string, string> = {
  invalid_message: "Escreva algo ou anexe um arquivo antes de enviar.",
  send_failed: "Não foi possível enviar a mensagem. Tente novamente.",
  media_too_large: "Arquivo maior que 15MB — escolha um menor.",
  media_upload_failed: "Não foi possível enviar o anexo. Tente novamente."
};
const successMessages: Record<string, string> = {
  message_sent: "Mensagem enviada."
};

function messageTime(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)); }

const MEDIA_LABELS: Record<string, string> = {
  image: "Imagem",
  video: "Vídeo",
  audio: "Áudio",
  document: "Documento",
  sticker: "Figurinha",
  location: "Localização",
  contact: "Contato",
  reaction: "Reação"
};

const MEDIA_ICONS: Record<string, string> = {
  image: "🖼️",
  video: "🎬",
  audio: "🎤",
  document: "📄",
  sticker: "🖼️"
};

// Sem media_object_key (mensagem de antes da captura de mídia — conexão
// precisa ser recriada pra habilitar — ou upload que falhou) cai num
// rótulo diferenciado, com ícone e estilo apagado — sem isso ficava
// visualmente idêntico a uma mensagem de texto de verdade digitada com
// esse mesmo nome (ex: alguém digitar "Figura" x a legenda automática
// "Figurinha").
function MessageBody({ messageType, textContent, mediaUrl }: { messageType: string; textContent: string | null; mediaUrl: string | undefined }) {
  if (messageType === "audio" && mediaUrl) {
    return <audio controls preload="none" src={mediaUrl} className="message-audio" />;
  }
  if ((messageType === "image" || messageType === "sticker") && mediaUrl) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mediaUrl} alt="" className="message-image" />
        {textContent ? <p>{textContent}</p> : null}
      </>
    );
  }
  if (messageType === "video" && mediaUrl) {
    return (
      <>
        <video controls preload="none" src={mediaUrl} className="message-video" />
        {textContent ? <p>{textContent}</p> : null}
      </>
    );
  }
  if (messageType === "document" && mediaUrl) {
    return <a href={mediaUrl} target="_blank" rel="noreferrer" className="message-document">📄 {textContent || "Baixar arquivo"}</a>;
  }
  if (MEDIA_ICONS[messageType]) {
    return (
      <p className="message-unavailable">
        {MEDIA_ICONS[messageType]} {MEDIA_LABELS[messageType]}
        <small>Mídia indisponível — reconecte o número em Configurações para habilitar.</small>
      </p>
    );
  }
  if (messageType !== "text") {
    return <p className="message-unavailable">Tipo de mensagem não suportado</p>;
  }
  return <p>{textContent}</p>;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Enviando...",
  sent: "Enviado",
  delivered: "Entregue",
  read: "Lido",
  received: "Recebido",
  failed: "Falhou"
};

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

// Cada contato tem um avatar de cor diferente (hash simples do nome) —
// só pra dar variedade visual à lista, igual referência que o usuário
// mandou; sem isso todo mundo tinha o mesmo verde, ficava monótono.
const AVATAR_PALETTE = [
  { background: "#d9efe3", color: "#126a43" },
  { background: "#ffe3d1", color: "#b8531f" },
  { background: "#e4defb", color: "#5b3fc4" },
  { background: "#fde0ec", color: "#c23a72" },
  { background: "#dbedff", color: "#1f68b8" },
  { background: "#fff3c4", color: "#8a6d00" },
  { background: "#dcf3ee", color: "#0f7a68" }
];

function avatarStyle(seed: string): { background: string; color: string } {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length] ?? { background: "#d9efe3", color: "#126a43" };
}

type ConversationRow = {
  id: string;
  contact_name: string | null;
  remote_jid: string;
  unread_count: number;
  last_message_preview: string | null;
  last_message_at: string | null;
  connection_id: string;
  // O tipo gerado trata o embed como array mesmo sendo N:1 (a FK
  // whatsapp_conversations.lead_id não tem unique, então o gerador não
  // reconhece a relação como 1:1) — na prática é sempre 0 ou 1 registro.
  leads: Array<{ deleted_at: string | null; source: string | null; stage_id: string | null }> | null;
};

function linkedLead(conversation: ConversationRow) {
  return conversation.leads?.[0] ?? null;
}

export default async function WhatsappPage({ searchParams }: WhatsappPageProps) {
  const params = await searchParams;
  const { supabase, orgId, role } = await getAuthContext();
  const errorMessage = params.error ? errorMessages[params.error] : undefined;
  const successMessage = params.success ? successMessages[params.success] : undefined;
  const feedback = errorMessage ? { kind: "error" as const, message: errorMessage } : successMessage ? { kind: "success" as const, message: successMessage } : undefined;

  const { data: connections } = await supabase.from("whatsapp_connections").select("id, display_name, phone_number, status, is_default").eq("org_id", orgId).order("is_default", { ascending: false }).order("created_at");
  const selectedConnectionId = connections?.some((connection) => connection.id === params.connection) ? params.connection : connections?.[0]?.id;
  const selectedConnection = connections?.find((connection) => connection.id === selectedConnectionId);

  let baseConversations: ConversationRow[] = [];
  const stageNameById = new Map<string, string>();

  if (selectedConnectionId) {
    const searchTerm = (params.q ?? "").trim().replace(/[%,()]/g, "").slice(0, 80);

    // Grupos (@g.us) não são leads — não aparecem na lista de conversas.
    // leads(deleted_at, source, stage_id) é um embed pela FK
    // whatsapp_conversations.lead_id — lead arquivado (deleted_at
    // preenchido) some da conversa também, sem precisar tocar em
    // whatsapp_conversations/whatsapp_messages: se o lead for restaurado
    // um dia, a conversa volta a aparecer sozinha. source/stage_id
    // alimentam os filtros "Origem"/"Etapa" e o rótulo de etapa na lista.
    let query = supabase
      .from("whatsapp_conversations")
      .select("id, contact_name, remote_jid, unread_count, last_message_preview, last_message_at, connection_id, leads(deleted_at, source, stage_id)")
      .eq("org_id", orgId)
      .eq("connection_id", selectedConnectionId)
      .not("remote_jid", "like", "%@g.us");
    if (searchTerm) query = query.or(`contact_name.ilike.%${searchTerm}%,remote_jid.ilike.%${searchTerm}%`);

    const [{ data: stageRows }, response] = await Promise.all([
      supabase.from("pipeline_stages").select("id, name").eq("org_id", orgId),
      query.order("last_message_at", { ascending: false, nullsFirst: false }).limit(100)
    ]);
    for (const stage of stageRows ?? []) stageNameById.set(stage.id, stage.name);

    baseConversations = (response.data ?? []).filter((conversation) => {
      const lead = linkedLead(conversation);
      return !lead || lead.deleted_at === null;
    });
  }

  const unreadTotal = baseConversations.filter((conversation) => conversation.unread_count > 0).length;

  const stageIdsPresent = new Set<string>();
  const sourcesPresent = new Set<string>();
  for (const conversation of baseConversations) {
    const lead = linkedLead(conversation);
    if (lead?.stage_id) stageIdsPresent.add(lead.stage_id);
    if (lead?.source) sourcesPresent.add(lead.source);
  }
  const stageOptions = Array.from(stageIdsPresent).map((id) => ({ id, name: stageNameById.get(id) ?? "Etapa" })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const sourceOptions = Array.from(sourcesPresent).sort((a, b) => a.localeCompare(b, "pt-BR"));

  let conversations = baseConversations;
  if (params.tab === "unread") conversations = conversations.filter((conversation) => conversation.unread_count > 0);
  if (params.stage) conversations = conversations.filter((conversation) => linkedLead(conversation)?.stage_id === params.stage);
  if (params.source) conversations = conversations.filter((conversation) => linkedLead(conversation)?.source === params.source);

  function hrefWithTab(tab: string | undefined) {
    const query = new URLSearchParams();
    if (selectedConnectionId) query.set("connection", selectedConnectionId);
    if (params.stage) query.set("stage", params.stage);
    if (params.source) query.set("source", params.source);
    if (params.q) query.set("q", params.q);
    if (tab) query.set("tab", tab);
    const qs = query.toString();
    return `/app/whatsapp${qs ? `?${qs}` : ""}`;
  }

  const selectedConversation = conversations.find((conversation) => conversation.id === params.conversation) ?? conversations[0];
  if (selectedConversation && selectedConversation.unread_count > 0) {
    // Abrir a conversa marca como lida — sem isso o badge de não lidas
    // fica preso pra sempre (0032_whatsapp_mark_conversation_read.sql
    // libera só essa coluna pro navegador).
    await supabase.from("whatsapp_conversations").update({ unread_count: 0 }).eq("id", selectedConversation.id).eq("org_id", orgId);
    selectedConversation.unread_count = 0;
  }
  let messages: Array<{ id: string; direction: string; message_type: string; text_content: string | null; status: string; provider_timestamp: string | null; created_at: string; media_object_key: string | null }> = [];
  const mediaUrls: Record<string, string> = {};
  if (selectedConversation) {
    // Ordem decrescente (mais recente primeiro) — combina com
    // flex-direction: column-reverse no .message-stream (globals.css), que
    // já inicia a rolagem na mensagem mais recente sem precisar de JS.
    // Ordena só por created_at (nunca nulo): mensagens enviadas pelo Kavro
    // antes da correção do envio ficaram com provider_timestamp nulo, e
    // ordenar por uma coluna nullable com nulls-last jogava essas
    // mensagens pro fim errado da lista.
    const response = await supabase.from("whatsapp_messages").select("id, direction, message_type, text_content, status, provider_timestamp, created_at, media_object_key").eq("org_id", orgId).eq("conversation_id", selectedConversation.id).order("created_at", { ascending: false }).limit(200);
    messages = response.data ?? [];

    // whatsapp-media é bucket privado — precisa de URL assinada por
    // request, não dá pra usar getPublicUrl (ver 0033_whatsapp_media_bucket.sql).
    const mediaKeys = Array.from(new Set(messages.map((message) => message.media_object_key).filter((key): key is string => Boolean(key))));
    if (mediaKeys.length) {
      const { data: signed } = await supabase.storage.from("whatsapp-media").createSignedUrls(mediaKeys, 3600);
      for (const item of signed ?? []) if (item.signedUrl && item.path) mediaUrls[item.path] = item.signedUrl;
    }
  }

  return <main className="inbox-page"><ChatAutoRefresh /><header className="inbox-topbar"><div><div><p className="eyebrow">ATENDIMENTO</p><h1>Conversas</h1></div></div><div className="connection-picker">{connections?.length ? <form method="get"><label>Número<select name="connection" defaultValue={selectedConnectionId}>{connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.display_name}{connection.phone_number ? ` · ${connection.phone_number}` : ""}</option>)}</select></label><button>Trocar</button></form> : null}{role !== "member" ? <Link href="/app/whatsapp/settings">Configurar WhatsApp</Link> : null}</div></header>
    {feedback ? <div className={`feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</div> : null}
    {!connections?.length ? <section className="inbox-empty"><div className="whatsapp-mark">◉</div><p className="eyebrow">CAIXA COMPARTILHADA</p><h2>Conecte o primeiro número</h2><p>As conversas aparecerão aqui depois que um administrador conectar o WhatsApp com segurança pelo backend do Kavro.</p>{role !== "member" ? <Link href="/app/whatsapp/settings">Preparar conexão</Link> : <span>Solicite a conexão ao administrador da empresa.</span>}</section> : <section className="inbox-layout">
      <aside className="conversation-panel">
        <InboxFilterForm>
          <input type="hidden" name="connection" value={selectedConnectionId} />
          <input type="search" name="q" defaultValue={params.q ?? ""} placeholder="Buscar por nome ou telefone" aria-label="Buscar conversa" />
          <select name="stage" defaultValue={params.stage ?? ""} aria-label="Filtrar por etapa">
            <option value="">Todas as etapas</option>
            {stageOptions.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
          </select>
          <select name="source" defaultValue={params.source ?? ""} aria-label="Filtrar por origem">
            <option value="">Todas as origens</option>
            {sourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}
          </select>
        </InboxFilterForm>
        <nav className="inbox-tabs" aria-label="Filtrar por status">
          <Link className={params.tab !== "unread" ? "active" : ""} href={hrefWithTab(undefined)}>Conversas</Link>
          <Link className={params.tab === "unread" ? "active" : ""} href={hrefWithTab("unread")}>Não lidas{unreadTotal > 0 ? <b>{unreadTotal}</b> : null}</Link>
        </nav>
        {conversations.length ? <nav aria-label="Conversas do WhatsApp" className="conversation-list">{conversations.map((conversation) => {
          const lead = linkedLead(conversation);
          const stageLabel = lead?.stage_id ? stageNameById.get(lead.stage_id) : undefined;
          const displayName = conversation.contact_name || conversation.remote_jid;
          return <div className={`conversation-row ${conversation.id === selectedConversation?.id ? "active" : ""}`} key={conversation.id}>
            <Link className="conversation-row-main" href={`/app/whatsapp?connection=${selectedConnectionId}&conversation=${conversation.id}`}>
              <span style={avatarStyle(displayName)}>{displayName[0]?.toUpperCase()}</span>
              <div>
                <strong>{displayName}</strong>
                {stageLabel ? <span className="conversation-stage">{stageLabel}</span> : null}
                <small>{conversation.last_message_preview || "Sem mensagens"}</small>
              </div>
              {conversation.last_message_at ? <time>{messageTime(conversation.last_message_at)}</time> : null}
              {conversation.unread_count > 0 ? <b>{conversation.unread_count}</b> : null}
            </Link>
            {/* Só faz sentido "marcar como não lida" numa conversa que já
                está lida — numa que já tem o badge verde, seria redundante
                (e foi exatamente essa combinação que ficou poluída). */}
            {conversation.unread_count === 0 ? <MarkUnreadButton conversationId={conversation.id} /> : null}
          </div>;
        })}</nav> : <div className="conversation-empty">{baseConversations.length ? "Nenhuma conversa encontrada com esses filtros." : "Nenhuma conversa recebida neste número."}</div>}
      </aside>
      <section className="chat-panel">{selectedConversation ? <><header className="no-print"><div className="chat-avatar" style={avatarStyle(selectedConversation.contact_name || selectedConversation.remote_jid)}>{(selectedConversation.contact_name || selectedConversation.remote_jid)[0]?.toUpperCase()}</div><div><strong>{selectedConversation.contact_name || selectedConversation.remote_jid}</strong><small>{selectedConversation.remote_jid}</small></div>{messages.length ? <ExportChatButton /> : null}</header><div className="chat-print-header"><p className="eyebrow">TRANSCRIÇÃO DE CONVERSA — KAVRO CRM</p><h2>{selectedConversation.contact_name || selectedConversation.remote_jid}</h2><p>{selectedConversation.remote_jid} · Atendente: {selectedConnection?.display_name ?? "—"} · {messages.length} {messages.length === 1 ? "mensagem" : "mensagens"} · Exportado em {messageTime(new Date().toISOString())}</p></div><div className="message-stream">{messages.length ? messages.map((message) => <article className={`message-bubble ${message.direction}`} key={message.id}>{message.direction === "outbound" && selectedConnection?.display_name ? <span className="sender-name">{selectedConnection.display_name}</span> : null}<MessageBody messageType={message.message_type} textContent={message.text_content} mediaUrl={message.media_object_key ? mediaUrls[message.media_object_key] : undefined} /><time>{messageTime(message.provider_timestamp || message.created_at)} · {statusLabel(message.status)}</time></article>) : <div className="chat-empty"><span className="chat-empty-icon">💬</span>A conversa ainda não possui mensagens.</div>}</div><form action={sendWhatsappMessage} className="chat-composer no-print"><input type="hidden" name="connection_id" value={selectedConnectionId} /><input type="hidden" name="conversation_id" value={selectedConversation.id} /><ChatComposerInput /><SubmitButton label="Enviar" pendingLabel="Enviando..." /></form></> : <div className="chat-empty"><span className="chat-empty-icon">◌</span>Selecione uma conversa para começar.</div>}</section>
    </section>}
  </main>;
}
