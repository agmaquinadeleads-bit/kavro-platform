import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { KavroSession } from "../auth/session";

type SendMessageInput = { connectionId: string; conversationId: string; text: string };
type ConversationRow = { id: string };
type MessageRow = { id: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Só cria a mensagem pendente + o item da fila — o envio de verdade
// (chamar a Evolution ou a Graph API) acontece em
// whatsapp-outbox-worker.service.ts, assíncrono. Responde rápido de
// propósito: quem está digitando não deveria esperar a Meta/Evolution
// responder pra ver o "enviando..." sumir da tela.
@Injectable()
export class WhatsappSendService {
  private baseUrl() {
    return process.env.SUPABASE_URL!.replace(/\/$/, "");
  }

  private serviceHeaders() {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
  }

  async send(session: KavroSession, input: SendMessageInput) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new ServiceUnavailableException("Cofre de credenciais não configurado");
    if (!UUID_PATTERN.test(input.connectionId) || !UUID_PATTERN.test(input.conversationId)) throw new BadRequestException("Conexão ou conversa inválida");

    const trimmedText = input.text.trim();
    if (!trimmedText) throw new BadRequestException("Mensagem vazia");
    if (trimmedText.length > 20000) throw new BadRequestException("Mensagem muito longa");

    const conversation = await this.selectOne<ConversationRow>(
      "whatsapp_conversations",
      `id=eq.${input.conversationId}&org_id=eq.${session.organizationId}&connection_id=eq.${input.connectionId}&select=id`
    );
    if (!conversation) throw new BadRequestException("Conversa não encontrada");

    const message = await this.insertOne<MessageRow>("whatsapp_messages", {
      org_id: session.organizationId,
      connection_id: input.connectionId,
      conversation_id: conversation.id,
      direction: "outbound",
      message_type: "text",
      status: "pending",
      text_content: trimmedText,
      client_idempotency_key: randomUUID(),
      created_by: session.userId
    });
    if (!message) throw new ServiceUnavailableException("Não foi possível registrar a mensagem");

    await this.insertOne("whatsapp_outbox", { org_id: session.organizationId, message_id: message.id });

    // A própria mensagem enviada também vira o "último preview" da
    // conversa — sem isso a lista de conversas só reflete inbound.
    await fetch(`${this.baseUrl()}/rest/v1/whatsapp_conversations?id=eq.${conversation.id}`, {
      method: "PATCH",
      headers: this.serviceHeaders(),
      body: JSON.stringify({ last_message_preview: trimmedText.slice(0, 500), last_message_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(12000)
    });

    return { messageId: message.id, status: "pending" };
  }

  private async selectOne<T>(table: string, query: string): Promise<T | null> {
    const response = await fetch(`${this.baseUrl()}/rest/v1/${table}?${query}&limit=1`, {
      headers: this.serviceHeaders(),
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new ServiceUnavailableException(`Falha ao consultar ${table}`);
    const rows = await response.json() as T[];
    return rows[0] ?? null;
  }

  private async insertOne<T>(table: string, body: Record<string, unknown>): Promise<T | null> {
    const response = await fetch(`${this.baseUrl()}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...this.serviceHeaders(), Prefer: "return=representation" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new ServiceUnavailableException(`Falha ao gravar em ${table}`);
    const rows = await response.json() as T[];
    return rows[0] ?? null;
  }
}
