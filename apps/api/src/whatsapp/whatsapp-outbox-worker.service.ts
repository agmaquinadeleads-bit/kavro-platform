import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { EvolutionClient } from "./evolution.client";
import { MetaWhatsappClient } from "./meta-whatsapp.client";

type OutboxItem = { id: number | null; org_id: string | null; message_id: string | null; attempts: number | null };
type ClaimedItem = { id: number; orgId: string; messageId: string; attempts: number };
type MessageRow = { id: string; connection_id: string; conversation_id: string; message_type: string; text_content: string | null; media_object_key: string | null; media_mime_type: string | null };
type ConnectionRow = { id: string; provider: "evolution" | "whatsapp_cloud"; instance_name: string };
type ConversationRow = { remote_jid: string };
type CredentialsRow = { external_phone_number_id: string | null };
type EvolutionSendResponse = { key?: { id?: string } };

const WORKER_ID = `worker-${randomUUID()}`;
const MAX_ATTEMPTS = 5;

// Drena whatsapp_outbox e envia de verdade (Evolution ou Meta Cloud API,
// conforme o provider da conexão) — mesmo desenho do
// content-publish-worker.service.ts (claim FOR UPDATE SKIP LOCKED, backoff
// exponencial, dead-letter). Mais frequente que aquele (chat ao vivo, não
// post agendado).
@Injectable()
export class WhatsappOutboxWorkerService {
  private readonly logger = new Logger(WhatsappOutboxWorkerService.name);

  constructor(
    private readonly evolution: EvolutionClient,
    private readonly metaWhatsapp: MetaWhatsappClient
  ) {}

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

  private async patch(table: string, query: string, body: Record<string, unknown>): Promise<void> {
    const response = await fetch(`${this.baseUrl()}/rest/v1/${table}?${query}`, {
      method: "PATCH",
      headers: this.serviceHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`Atualização em ${table} falhou (${response.status}): ${await response.text()}`);
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async drainOnce() {
    if (!this.configured()) return;
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const claimedSomething = await this.drainOneItem();
      if (!claimedSomething) break;
    }
  }

  private async drainOneItem(): Promise<boolean> {
    let raw: OutboxItem;
    try {
      raw = await this.rpc<OutboxItem>("claim_whatsapp_outbox_item", { p_worker_id: WORKER_ID });
    } catch (error) {
      this.logger.error(`Falha ao reivindicar item da fila: ${(error as Error).message}`);
      return false;
    }
    if (!raw?.id || !raw.org_id || !raw.message_id) return false;

    const item: ClaimedItem = { id: raw.id, orgId: raw.org_id, messageId: raw.message_id, attempts: raw.attempts ?? 1 };

    try {
      await this.sendItem(item);
    } catch (error) {
      await this.handleFailure(item, (error as Error).message);
    }
    return true;
  }

  private async sendItem(item: ClaimedItem) {
    const message = await this.selectOne<MessageRow>(
      "whatsapp_messages",
      `id=eq.${item.messageId}&org_id=eq.${item.orgId}&select=id,connection_id,conversation_id,message_type,text_content,media_object_key,media_mime_type`
    );
    if (!message) throw new Error("Mensagem não encontrada");
    if (!message.text_content && !message.media_object_key) throw new Error("Mensagem sem texto e sem mídia");

    const connection = await this.selectOne<ConnectionRow>(
      "whatsapp_connections",
      `id=eq.${message.connection_id}&org_id=eq.${item.orgId}&select=id,provider,instance_name`
    );
    if (!connection) throw new Error("Conexão não encontrada");

    const conversation = await this.selectOne<ConversationRow>(
      "whatsapp_conversations",
      `id=eq.${message.conversation_id}&org_id=eq.${item.orgId}&select=remote_jid`
    );
    if (!conversation) throw new Error("Conversa não encontrada");

    const externalId = message.media_object_key && (message.message_type === "image" || message.message_type === "audio")
      ? await this.sendMedia(connection, conversation, message as MessageRow & { media_object_key: string })
      : connection.provider === "evolution"
        ? await this.sendViaEvolution(connection, conversation, message.text_content ?? "")
        : await this.sendViaMeta(connection, conversation, message.text_content ?? "");

    await this.patch("whatsapp_messages", `id=eq.${item.messageId}`, { status: "sent", sent_at: new Date().toISOString(), external_id: externalId });
    await this.patch("whatsapp_outbox", `id=eq.${item.id}`, { status: "sent" });
  }

  private async sendViaEvolution(connection: ConnectionRow, conversation: ConversationRow, text: string): Promise<string> {
    // Evolution espera só o número — o próprio provedor recompõe o JID
    // (@s.whatsapp.net) internamente.
    const number = conversation.remote_jid.split("@")[0] ?? conversation.remote_jid;
    const result = await this.evolution.sendText(connection.instance_name, number, text) as EvolutionSendResponse;
    return result.key?.id ?? randomUUID();
  }

  private async sendViaMeta(connection: ConnectionRow, conversation: ConversationRow, text: string): Promise<string> {
    const credentials = await this.selectOne<CredentialsRow>(
      "whatsapp_provider_credentials",
      `connection_id=eq.${connection.id}&select=external_phone_number_id`
    );
    if (!credentials?.external_phone_number_id) throw new Error("Conexão sem número configurado");
    const accessToken = await this.rpc<string>("get_whatsapp_access_token", { p_connection_id: connection.id });
    return await this.metaWhatsapp.sendText(credentials.external_phone_number_id, accessToken, conversation.remote_jid, text);
  }

  private async downloadMedia(objectKey: string): Promise<Buffer> {
    const response = await fetch(`${this.baseUrl()}/storage/v1/object/whatsapp-media/${objectKey}`, {
      headers: this.serviceHeaders(),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`Falha ao baixar mídia do Storage (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  }

  private async sendMedia(connection: ConnectionRow, conversation: ConversationRow, message: MessageRow & { media_object_key: string }): Promise<string> {
    const bytes = await this.downloadMedia(message.media_object_key);
    const mimeType = message.media_mime_type || (message.message_type === "image" ? "image/jpeg" : "audio/ogg");

    if (connection.provider === "evolution") {
      const number = conversation.remote_jid.split("@")[0] ?? conversation.remote_jid;
      const base64 = bytes.toString("base64");
      const result = message.message_type === "audio"
        ? await this.evolution.sendAudio(connection.instance_name, number, base64) as EvolutionSendResponse
        : await this.evolution.sendImage(connection.instance_name, number, base64, mimeType, message.text_content ?? undefined) as EvolutionSendResponse;
      return result.key?.id ?? randomUUID();
    }

    const credentials = await this.selectOne<CredentialsRow>(
      "whatsapp_provider_credentials",
      `connection_id=eq.${connection.id}&select=external_phone_number_id`
    );
    if (!credentials?.external_phone_number_id) throw new Error("Conexão sem número configurado");
    const accessToken = await this.rpc<string>("get_whatsapp_access_token", { p_connection_id: connection.id });
    const mediaId = await this.metaWhatsapp.uploadMedia(credentials.external_phone_number_id, accessToken, bytes, mimeType);
    return await this.metaWhatsapp.sendMedia(credentials.external_phone_number_id, accessToken, conversation.remote_jid, mediaId, message.message_type as "image" | "audio", message.text_content ?? undefined);
  }

  private async handleFailure(item: ClaimedItem, errorMessage: string) {
    this.logger.warn(`Falha ao enviar mensagem ${item.messageId} (tentativa ${item.attempts}): ${errorMessage}`);
    const isDeadLetter = item.attempts >= MAX_ATTEMPTS;
    const backoffMinutes = Math.min(60, 2 ** item.attempts);
    await this.patch("whatsapp_outbox", `id=eq.${item.id}`, {
      status: isDeadLetter ? "dead_letter" : "failed",
      last_error_message: errorMessage.slice(0, 2000),
      next_attempt_at: new Date(Date.now() + backoffMinutes * 60_000).toISOString()
    });
    if (isDeadLetter) await this.patch("whatsapp_messages", `id=eq.${item.messageId}`, { status: "failed" });
  }
}
