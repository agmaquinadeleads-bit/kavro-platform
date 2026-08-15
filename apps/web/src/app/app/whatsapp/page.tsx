import Link from "next/link";
import { getAuthContext } from "@/lib/auth-context";

type WhatsappPageProps = { searchParams: Promise<{ conversation?: string; connection?: string }> };

function messageTime(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)); }

export default async function WhatsappPage({ searchParams }: WhatsappPageProps) {
  const params = await searchParams;
  const { supabase, orgId, role } = await getAuthContext();

  const { data: connections } = await supabase.from("whatsapp_connections").select("id, display_name, phone_number, status, is_default").eq("org_id", orgId).order("is_default", { ascending: false }).order("created_at");
  const selectedConnectionId = connections?.some((connection) => connection.id === params.connection) ? params.connection : connections?.[0]?.id;
  let conversations: Array<{ id: string; contact_name: string | null; remote_jid: string; unread_count: number; last_message_preview: string | null; last_message_at: string | null; connection_id: string }> = [];
  if (selectedConnectionId) {
    const response = await supabase.from("whatsapp_conversations").select("id, contact_name, remote_jid, unread_count, last_message_preview, last_message_at, connection_id").eq("org_id", orgId).eq("connection_id", selectedConnectionId).order("last_message_at", { ascending: false, nullsFirst: false }).limit(100);
    conversations = response.data ?? [];
  }
  const selectedConversation = conversations.find((conversation) => conversation.id === params.conversation) ?? conversations[0];
  let messages: Array<{ id: string; direction: string; message_type: string; text_content: string | null; status: string; provider_timestamp: string | null; created_at: string }> = [];
  if (selectedConversation) {
    const response = await supabase.from("whatsapp_messages").select("id, direction, message_type, text_content, status, provider_timestamp, created_at").eq("org_id", orgId).eq("conversation_id", selectedConversation.id).order("provider_timestamp", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }).limit(200);
    messages = response.data ?? [];
  }

  return <main className="inbox-page"><header className="inbox-topbar"><div><div><p className="eyebrow">ATENDIMENTO</p><h1>Conversas</h1></div></div><div className="connection-picker">{connections?.length ? <form method="get"><label>Número<select name="connection" defaultValue={selectedConnectionId}>{connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.display_name}{connection.phone_number ? ` · ${connection.phone_number}` : ""}</option>)}</select></label><button>Trocar</button></form> : null}{role !== "member" ? <Link href="/app/whatsapp/settings">Configurar WhatsApp</Link> : null}</div></header>
    {!connections?.length ? <section className="inbox-empty"><div className="whatsapp-mark">◉</div><p className="eyebrow">CAIXA COMPARTILHADA</p><h2>Conecte o primeiro número</h2><p>As conversas aparecerão aqui depois que um administrador conectar o WhatsApp com segurança pelo backend do Kavro.</p>{role !== "member" ? <Link href="/app/whatsapp/settings">Preparar conexão</Link> : <span>Solicite a conexão ao administrador da empresa.</span>}</section> : <section className="inbox-layout">
      <aside className="conversation-panel"><div className="conversation-search"><input type="search" placeholder="Buscar conversa" aria-label="Buscar conversa" disabled /></div>{conversations.length ? <nav aria-label="Conversas do WhatsApp">{conversations.map((conversation) => <Link className={conversation.id === selectedConversation?.id ? "active" : ""} href={`/app/whatsapp?connection=${selectedConnectionId}&conversation=${conversation.id}`} key={conversation.id}><span>{(conversation.contact_name || conversation.remote_jid)[0]?.toUpperCase()}</span><div><strong>{conversation.contact_name || conversation.remote_jid}</strong><small>{conversation.last_message_preview || "Sem mensagens"}</small></div>{conversation.last_message_at ? <time>{messageTime(conversation.last_message_at)}</time> : null}{conversation.unread_count > 0 ? <b>{conversation.unread_count}</b> : null}</Link>)}</nav> : <div className="conversation-empty">Nenhuma conversa recebida neste número.</div>}</aside>
      <section className="chat-panel">{selectedConversation ? <><header><div className="chat-avatar">{(selectedConversation.contact_name || selectedConversation.remote_jid)[0]?.toUpperCase()}</div><div><strong>{selectedConversation.contact_name || selectedConversation.remote_jid}</strong><small>{selectedConversation.remote_jid}</small></div></header><div className="message-stream">{messages.length ? messages.map((message) => <article className={`message-bubble ${message.direction}`} key={message.id}><small>{message.message_type !== "text" ? message.message_type.toUpperCase() : null}</small><p>{message.text_content || "Mídia protegida"}</p><time>{messageTime(message.provider_timestamp || message.created_at)} · {message.status}</time></article>) : <div className="chat-empty">A conversa ainda não possui mensagens.</div>}</div><footer className="chat-composer"><textarea aria-label="Mensagem" placeholder="Digite uma mensagem" disabled /><button disabled>Enviar</button><small>O envio será liberado após a conexão segura com a Evolution.</small></footer></> : <div className="chat-empty">Selecione uma conversa para começar.</div>}</section>
    </section>}
  </main>;
}
