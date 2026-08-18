import Link from "next/link";
import { getAuthContext } from "@/lib/auth-context";
import { SubmitButton } from "@/components/SubmitButton";
import { ChatMessageTextarea } from "@/components/ChatMessageTextarea";
import { sendWhatsappMessage } from "./actions";

type WhatsappPageProps = { searchParams: Promise<{ conversation?: string; connection?: string; error?: string; success?: string }> };

const errorMessages: Record<string, string> = {
  invalid_message: "Revise a mensagem antes de enviar.",
  send_failed: "Não foi possível enviar a mensagem. Tente novamente."
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

function messagePreview(textContent: string | null, messageType: string) {
  if (textContent) return textContent;
  return MEDIA_LABELS[messageType] ?? "Conteúdo não suportado ainda";
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

export default async function WhatsappPage({ searchParams }: WhatsappPageProps) {
  const params = await searchParams;
  const { supabase, orgId, role } = await getAuthContext();
  const errorMessage = params.error ? errorMessages[params.error] : undefined;
  const successMessage = params.success ? successMessages[params.success] : undefined;
  const feedback = errorMessage ? { kind: "error" as const, message: errorMessage } : successMessage ? { kind: "success" as const, message: successMessage } : undefined;

  const { data: connections } = await supabase.from("whatsapp_connections").select("id, display_name, phone_number, status, is_default").eq("org_id", orgId).order("is_default", { ascending: false }).order("created_at");
  const selectedConnectionId = connections?.some((connection) => connection.id === params.connection) ? params.connection : connections?.[0]?.id;
  const selectedConnection = connections?.find((connection) => connection.id === selectedConnectionId);
  let conversations: Array<{ id: string; contact_name: string | null; remote_jid: string; unread_count: number; last_message_preview: string | null; last_message_at: string | null; connection_id: string }> = [];
  if (selectedConnectionId) {
    // Grupos (@g.us) não são leads — não aparecem na lista de conversas.
    const response = await supabase.from("whatsapp_conversations").select("id, contact_name, remote_jid, unread_count, last_message_preview, last_message_at, connection_id").eq("org_id", orgId).eq("connection_id", selectedConnectionId).not("remote_jid", "like", "%@g.us").order("last_message_at", { ascending: false, nullsFirst: false }).limit(100);
    conversations = response.data ?? [];
  }
  const selectedConversation = conversations.find((conversation) => conversation.id === params.conversation) ?? conversations[0];
  if (selectedConversation && selectedConversation.unread_count > 0) {
    // Abrir a conversa marca como lida — sem isso o badge de não lidas
    // fica preso pra sempre (0032_whatsapp_mark_conversation_read.sql
    // libera só essa coluna pro navegador).
    await supabase.from("whatsapp_conversations").update({ unread_count: 0 }).eq("id", selectedConversation.id).eq("org_id", orgId);
    selectedConversation.unread_count = 0;
  }
  let messages: Array<{ id: string; direction: string; message_type: string; text_content: string | null; status: string; provider_timestamp: string | null; created_at: string }> = [];
  if (selectedConversation) {
    // Ordem decrescente (mais recente primeiro) — combina com
    // flex-direction: column-reverse no .message-stream (globals.css), que
    // já inicia a rolagem na mensagem mais recente sem precisar de JS.
    // Ordena só por created_at (nunca nulo): mensagens enviadas pelo Kavro
    // antes da correção do envio ficaram com provider_timestamp nulo, e
    // ordenar por uma coluna nullable com nulls-last jogava essas
    // mensagens pro fim errado da lista.
    const response = await supabase.from("whatsapp_messages").select("id, direction, message_type, text_content, status, provider_timestamp, created_at").eq("org_id", orgId).eq("conversation_id", selectedConversation.id).order("created_at", { ascending: false }).limit(200);
    messages = response.data ?? [];
  }

  return <main className="inbox-page"><header className="inbox-topbar"><div><div><p className="eyebrow">ATENDIMENTO</p><h1>Conversas</h1></div></div><div className="connection-picker">{connections?.length ? <form method="get"><label>Número<select name="connection" defaultValue={selectedConnectionId}>{connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.display_name}{connection.phone_number ? ` · ${connection.phone_number}` : ""}</option>)}</select></label><button>Trocar</button></form> : null}{role !== "member" ? <Link href="/app/whatsapp/settings">Configurar WhatsApp</Link> : null}</div></header>
    {feedback ? <div className={`feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</div> : null}
    {!connections?.length ? <section className="inbox-empty"><div className="whatsapp-mark">◉</div><p className="eyebrow">CAIXA COMPARTILHADA</p><h2>Conecte o primeiro número</h2><p>As conversas aparecerão aqui depois que um administrador conectar o WhatsApp com segurança pelo backend do Kavro.</p>{role !== "member" ? <Link href="/app/whatsapp/settings">Preparar conexão</Link> : <span>Solicite a conexão ao administrador da empresa.</span>}</section> : <section className="inbox-layout">
      <aside className="conversation-panel"><div className="conversation-search"><input type="search" placeholder="Buscar conversa" aria-label="Buscar conversa" disabled /></div>{conversations.length ? <nav aria-label="Conversas do WhatsApp">{conversations.map((conversation) => <Link className={conversation.id === selectedConversation?.id ? "active" : ""} href={`/app/whatsapp?connection=${selectedConnectionId}&conversation=${conversation.id}`} key={conversation.id}><span>{(conversation.contact_name || conversation.remote_jid)[0]?.toUpperCase()}</span><div><strong>{conversation.contact_name || conversation.remote_jid}</strong><small>{conversation.last_message_preview || "Sem mensagens"}</small></div>{conversation.last_message_at ? <time>{messageTime(conversation.last_message_at)}</time> : null}{conversation.unread_count > 0 ? <b>{conversation.unread_count}</b> : null}</Link>)}</nav> : <div className="conversation-empty">Nenhuma conversa recebida neste número.</div>}</aside>
      <section className="chat-panel">{selectedConversation ? <><header><div className="chat-avatar">{(selectedConversation.contact_name || selectedConversation.remote_jid)[0]?.toUpperCase()}</div><div><strong>{selectedConversation.contact_name || selectedConversation.remote_jid}</strong><small>{selectedConversation.remote_jid}</small></div></header><div className="message-stream">{messages.length ? messages.map((message) => <article className={`message-bubble ${message.direction}`} key={message.id}>{message.direction === "outbound" && selectedConnection?.display_name ? <span className="sender-name">{selectedConnection.display_name}</span> : null}<small>{message.message_type !== "text" ? message.message_type.toUpperCase() : null}</small><p>{messagePreview(message.text_content, message.message_type)}</p><time>{messageTime(message.provider_timestamp || message.created_at)} · {statusLabel(message.status)}</time></article>) : <div className="chat-empty">A conversa ainda não possui mensagens.</div>}</div><form action={sendWhatsappMessage} className="chat-composer"><input type="hidden" name="connection_id" value={selectedConnectionId} /><input type="hidden" name="conversation_id" value={selectedConversation.id} /><ChatMessageTextarea /><SubmitButton label="Enviar" pendingLabel="Enviando..." /></form></> : <div className="chat-empty">Selecione uma conversa para começar.</div>}</section>
    </section>}
  </main>;
}
