import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

type WebhookEvent = {
  id: number | null;
  org_id: string | null;
  connection_id: string | null;
  provider_event_id: string | null;
  sanitized_payload: Record<string, unknown> | null;
};

type ClaimedEvent = {
  id: number;
  orgId: string;
  connectionId: string;
  providerEventId: string;
  payload: Record<string, unknown>;
};

type ConnectionRow = { provider: "evolution" | "whatsapp_cloud" };
type ConversationRow = { id: string; unread_count: number };

type NormalizedMessage = {
  remoteJid: string;
  contactName: string | null;
  messageType: string;
  textContent: string | null;
  providerTimestamp: string | null;
};

const WORKER_ID = `worker-${randomUUID()}`;
const MAX_ITEMS_PER_TICK = 20;
const VALID_MESSAGE_TYPES = new Set(["text", "image", "video", "audio", "document", "sticker", "location", "contact", "reaction", "unknown"]);

function toIsoTimestamp(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

// whatsapp_webhook_events guarda um payload em formato diferente por
// provedor (ver meta-webhook.service.ts e evolution-webhook.service.ts) —
// normaliza os dois pro mesmo formato antes de gravar em
// whatsapp_conversations/whatsapp_messages.
function normalize(provider: "evolution" | "whatsapp_cloud", payload: Record<string, unknown>): NormalizedMessage | null {
  if (provider === "evolution") {
    const remoteJid = typeof payload.remote_jid === "string" ? payload.remote_jid : null;
    if (!remoteJid) return null;
    const rawType = typeof payload.message_type === "string" ? payload.message_type : "unknown";
    return {
      remoteJid,
      contactName: typeof payload.push_name === "string" ? payload.push_name : null,
      messageType: rawType === "conversation" ? "text" : (VALID_MESSAGE_TYPES.has(rawType) ? rawType : "unknown"),
      textContent: typeof payload.text === "string" ? payload.text : null,
      providerTimestamp: toIsoTimestamp(payload.timestamp)
    };
  }

  // whatsapp_cloud (Meta): não existe JID — usa o telefone (dígitos, campo
  // "from" da Cloud API) como identificador estável da conversa dentro
  // dessa conexão.
  const from = typeof payload.from === "string" ? payload.from : null;
  if (!from) return null;
  const rawType = typeof payload.type === "string" ? payload.type : "unknown";
  return {
    remoteJid: from,
    contactName: null,
    messageType: VALID_MESSAGE_TYPES.has(rawType) ? rawType : "unknown",
    textContent: typeof payload.text === "string" ? payload.text : null,
    providerTimestamp: toIsoTimestamp(payload.timestamp)
  };
}

// Drena whatsapp_webhook_events e popula whatsapp_conversations/
// whatsapp_messages — sem isso a caixa de entrada nunca mostra nada, por
// mais que o webhook esteja capturando eventos brutos corretamente.
// A cada 15s (mais frequente que o worker de publicação de conteúdo, que
// roda a cada minuto — isso é chat ao vivo) processa até
// MAX_ITEMS_PER_TICK itens, pra não acumular atraso se vários eventos
// chegarem em rajada.
@Injectable()
export class WhatsappInboundWorkerService {
  private readonly logger = new Logger(WhatsappInboundWorkerService.name);

  private configured() {
    return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  }

  private baseUrl() {
    return process.env.SUPABASE_URL!.replace(/\/$/, "");
  }

  private serviceHeaders() {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
  }

  private async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl()}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: this.serviceHeaders(),
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`RPC ${name} falhou (${response.status}): ${await response.text()}`);
    return await response.json() as T;
  }

  private async selectOne<T>(table: string, query: string): Promise<T | null> {
    const response = await fetch(`${this.baseUrl()}/rest/v1/${table}?${query}&limit=1`, {
      headers: this.serviceHeaders(),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`Consulta a ${table} falhou (${response.status}): ${await response.text()}`);
    const rows = await response.json() as T[];
    return rows[0] ?? null;
  }

  private async insert<T>(table: string, body: Record<string, unknown>): Promise<{ conflict: boolean; row: T | null }> {
    const response = await fetch(`${this.baseUrl()}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...this.serviceHeaders(), Prefer: "return=representation" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
    if (response.status === 409) return { conflict: true, row: null };
    if (!response.ok) throw new Error(`Inserção em ${table} falhou (${response.status}): ${await response.text()}`);
    const rows = await response.json() as T[];
    return { conflict: false, row: rows[0] ?? null };
  }

  private async patch(table: string, query: string, body: Record<string, unknown>): Promise<void> {
    const response = await fetch(`${this.baseUrl()}/rest/v1/${table}?${query}`, {
      method: "PATCH",
      headers: this.serviceHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`Atualização em ${table} falhou (${response.status}): ${await response.text()}`);
  }

  @Cron("*/15 * * * * *")
  async drainOnce() {
    if (!this.configured()) return;
    for (let iteration = 0; iteration < MAX_ITEMS_PER_TICK; iteration += 1) {
      const claimedSomething = await this.drainOneItem();
      if (!claimedSomething) break;
    }
  }

  private async drainOneItem(): Promise<boolean> {
    let raw: WebhookEvent;
    try {
      raw = await this.rpc<WebhookEvent>("claim_whatsapp_webhook_event", { p_worker_id: WORKER_ID });
    } catch (error) {
      this.logger.error(`Falha ao reivindicar evento de webhook: ${(error as Error).message}`);
      return false;
    }
    if (!raw?.id || !raw.org_id || !raw.connection_id || !raw.provider_event_id) return false;

    const item: ClaimedEvent = {
      id: raw.id,
      orgId: raw.org_id,
      connectionId: raw.connection_id,
      providerEventId: raw.provider_event_id,
      payload: raw.sanitized_payload ?? {}
    };

    try {
      await this.processEvent(item);
      await this.patch("whatsapp_webhook_events", `id=eq.${item.id}`, { processing_status: "processed", processed_at: new Date().toISOString() });
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(`Falha ao processar evento ${item.id}: ${message}`);
      await this.patch("whatsapp_webhook_events", `id=eq.${item.id}`, { processing_status: "failed", error_code: message.slice(0, 120) });
    }
    return true;
  }

  private async processEvent(item: ClaimedEvent) {
    const connection = await this.selectOne<ConnectionRow>("whatsapp_connections", `id=eq.${item.connectionId}&org_id=eq.${item.orgId}&select=provider`);
    if (!connection) throw new Error("Conexão não encontrada");

    const normalized = normalize(connection.provider, item.payload);
    if (!normalized) throw new Error("Payload sem identificador de conversa reconhecível");

    const conversation = await this.findOrCreateConversation(item.orgId, item.connectionId, normalized);

    const insertedMessage = await this.insert("whatsapp_messages", {
      org_id: item.orgId,
      connection_id: item.connectionId,
      conversation_id: conversation.id,
      external_id: item.providerEventId,
      direction: "inbound",
      message_type: normalized.messageType,
      status: "received",
      sender_jid: normalized.remoteJid,
      text_content: normalized.textContent,
      provider_timestamp: normalized.providerTimestamp
    });
    // Conflito de external_id = esse evento já virou mensagem antes
    // (reprocessamento) — não é erro, só evita repetir o efeito colateral
    // de atualizar a conversa de novo.
    if (insertedMessage.conflict) return;
    this.logger.debug(`Mensagem inbound gravada: conversation=${conversation.id} type=${normalized.messageType}`);

    await this.patch("whatsapp_conversations", `id=eq.${conversation.id}`, {
      last_message_preview: (normalized.textContent ?? `[${normalized.messageType}]`).slice(0, 500),
      last_message_at: normalized.providerTimestamp ?? new Date().toISOString(),
      unread_count: conversation.unread_count + 1,
      ...(normalized.contactName ? { contact_name: normalized.contactName } : {})
    });
  }

  private async findOrCreateConversation(orgId: string, connectionId: string, normalized: NormalizedMessage): Promise<ConversationRow> {
    const existingQuery = `org_id=eq.${orgId}&connection_id=eq.${connectionId}&remote_jid=eq.${encodeURIComponent(normalized.remoteJid)}&select=id,unread_count`;
    const existing = await this.selectOne<ConversationRow>("whatsapp_conversations", existingQuery);
    if (existing) return existing;

    const created = await this.insert<ConversationRow>("whatsapp_conversations", {
      org_id: orgId,
      connection_id: connectionId,
      remote_jid: normalized.remoteJid,
      contact_name: normalized.contactName
    });
    if (created.row) return created.row;

    // Corrida rara: outra execução criou a conversa entre a checagem e o
    // insert (conflito na unique de remote_jid) — busca de novo.
    const retried = await this.selectOne<ConversationRow>("whatsapp_conversations", existingQuery);
    if (!retried) throw new Error("Não foi possível criar ou encontrar a conversa");
    return retried;
  }
}
