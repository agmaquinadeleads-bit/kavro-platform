import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";

type BaileysKey = { remoteJid?: string; fromMe?: boolean; id?: string };
type BaileysMessage = {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  imageMessage?: { caption?: string; mimetype?: string };
  videoMessage?: { caption?: string; mimetype?: string };
  audioMessage?: { mimetype?: string; seconds?: number; ptt?: boolean };
  documentMessage?: { caption?: string; fileName?: string; mimetype?: string };
  base64?: string;
};
type BaileysUpsertData = {
  key?: BaileysKey;
  pushName?: string;
  message?: BaileysMessage;
  messageType?: string;
  messageTimestamp?: number | string;
  base64?: string;
};
type EvolutionWebhookPayload = {
  event?: string;
  instance?: string;
  data?: BaileysUpsertData | BaileysUpsertData[];
};
type ExtractedEvolutionMessage = { providerEventId: string; sanitizedPayload: Record<string, unknown> };
type ResolvedConnection = { orgId: string; connectionId: string };

// A Evolution/Baileys usa os nomes internos das chaves de mensagem
// ("audioMessage", "imageMessage" etc.) no campo messageType — não bate
// com o enum curto que o resto do Kavro usa (message_type em
// whatsapp_messages). Sem esse mapeamento, todo áudio/imagem/vídeo cai no
// fallback "unknown" e aparece como "Conteúdo não suportado" no CRM,
// mesmo a mensagem sendo perfeitamente reconhecida.
const BAILEYS_TYPE_MAP: Record<string, string> = {
  conversation: "text",
  extendedTextMessage: "text",
  imageMessage: "image",
  videoMessage: "video",
  audioMessage: "audio",
  documentMessage: "document",
  stickerMessage: "sticker",
  locationMessage: "location",
  contactMessage: "contact",
  reactionMessage: "reaction"
};

const MIME_EXTENSIONS: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "audio/wav": "wav",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "application/pdf": "pdf"
};

function extensionFor(mimeType: string | undefined): string {
  if (!mimeType) return "bin";
  const base = mimeType.split(";")[0]?.trim().toLowerCase();
  return (base && MIME_EXTENSIONS[base]) || "bin";
}

function boundedString(value: unknown, maximum: number) {
  return typeof value === "string" && value.length > 0 ? value.slice(0, maximum) : undefined;
}

function extractText(message: BaileysMessage | undefined): string | undefined {
  if (!message) return undefined;
  return boundedString(message.conversation, 20000) ?? boundedString(message.extendedTextMessage?.text, 20000);
}

function messageTypeOf(data: BaileysUpsertData): string {
  const rawType = typeof data.messageType === "string" ? BAILEYS_TYPE_MAP[data.messageType] : undefined;
  if (rawType) return rawType;
  if (data.message?.conversation || data.message?.extendedTextMessage) return "text";
  if (data.message?.imageMessage) return "image";
  if (data.message?.videoMessage) return "video";
  if (data.message?.audioMessage) return "audio";
  if (data.message?.documentMessage) return "document";
  return "unknown";
}

// base64:true (ver evolution.client.ts createInstance) manda a mídia já
// decodificada — em versões diferentes da Evolution isso aparece ora em
// data.base64, ora em data.message.base64; tenta os dois.
const MEDIA_TYPES = new Set(["image", "video", "audio", "document", "sticker"]);

const MAX_MEDIA_BASE64_LENGTH = 15_000_000;

function mediaOf(data: BaileysUpsertData): { base64: string; mimeType: string | undefined } | undefined {
  const candidate = data.base64 || data.message?.base64;
  // boundedString() TRUNCA string longa — pra texto normal tudo bem, mas
  // truncar base64 no meio corrompe o arquivo de mídia. Aqui rejeita em
  // vez de cortar.
  if (typeof candidate !== "string" || !candidate.length || candidate.length > MAX_MEDIA_BASE64_LENGTH) return undefined;
  const base64 = candidate;
  const mimeType = data.message?.imageMessage?.mimetype
    ?? data.message?.videoMessage?.mimetype
    ?? data.message?.audioMessage?.mimetype
    ?? data.message?.documentMessage?.mimetype;
  return { base64, mimeType };
}

// A Evolution manda todos os eventos pra uma única URL por instância
// (webhookByEvents: false, ver evolution.client.ts createInstance) — o
// campo "event" distingue o tipo. Só processamos MESSAGES_UPSERT (mensagem
// nova) e ignoramos eco de mensagens enviadas por nós mesmos (fromMe).
//
// Aviso: o formato exato do payload do Baileys pode variar entre versões
// da Evolution — essa extração é best-effort e tolerante a campos
// ausentes (nunca lança por formato inesperado, só ignora o que não
// reconhece), pra não derrubar o webhook por causa de uma variação de
// payload.
export function extractEvolutionMessages(payload: EvolutionWebhookPayload): ExtractedEvolutionMessage[] {
  const eventName = (payload.event ?? "").toUpperCase().replace(/\./g, "_");
  if (eventName !== "MESSAGES_UPSERT") return [];

  const items = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
  const messages: ExtractedEvolutionMessage[] = [];

  for (const item of items) {
    const remoteJid = boundedString(item.key?.remoteJid, 160);
    const externalId = boundedString(item.key?.id, 255);
    if (!remoteJid || !externalId) continue;
    // Grupos (@g.us) e listas de transmissão (@broadcast) não são leads —
    // não interessam pro CRM, mesmo que a Evolution mande o evento.
    if (remoteJid.endsWith("@g.us") || remoteJid.endsWith("@broadcast")) continue;

    const messageType = messageTypeOf(item);
    const media = MEDIA_TYPES.has(messageType) ? mediaOf(item) : undefined;

    messages.push({
      providerEventId: externalId,
      sanitizedPayload: {
        remote_jid: remoteJid,
        push_name: boundedString(item.pushName, 160),
        message_type: messageType,
        text: extractText(item.message),
        timestamp: item.messageTimestamp !== undefined ? String(item.messageTimestamp) : undefined,
        // Mensagem mandada do próprio celular (fora do Kavro) também
        // precisa aparecer na conversa — só a mandada PELO Kavro já fica
        // gravada na hora do envio; o worker de recebimento reconcilia
        // pelo external_id pra não duplicar.
        from_me: item.key?.fromMe === true,
        // Campos temporários — persist() sobe pro Storage e troca por
        // media_object_key/media_mime_type antes de gravar em
        // whatsapp_webhook_events (nunca guarda base64 bruto no banco).
        ...(media ? { _media_base64: media.base64, _media_mimetype: media.mimeType } : {})
      }
    });
  }

  return messages;
}

@Injectable()
export class EvolutionWebhookService {
  private readonly logger = new Logger(EvolutionWebhookService.name);

  private serviceConfig() {
    const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!baseUrl || !serviceKey) throw new ServiceUnavailableException("Persistência segura do webhook não configurada");
    return { baseUrl, serviceKey };
  }

  private verifySecret(instanceSecret: string, providedSecret: string | undefined) {
    if (!providedSecret) throw new UnauthorizedException("Segredo do webhook ausente");
    const left = Buffer.from(providedSecret);
    const right = Buffer.from(instanceSecret);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new UnauthorizedException("Segredo do webhook inválido");
    }
  }

  async capture(instanceName: string, payload: EvolutionWebhookPayload, providedSecret: string | undefined) {
    const connection = await this.resolveConnection(instanceName);
    if (!connection) return { accepted: false, events: 0 };

    const secret = await this.getWebhookSecret(connection.connectionId);
    this.verifySecret(secret, providedSecret);

    const events = extractEvolutionMessages(payload);
    // Log temporário — mostra o payload bruto (truncado) e quantas
    // mensagens a extração reconheceu, pra confirmar se o formato bate
    // com o esperado (extractEvolutionMessages é um chute sem instância
    // real pra testar contra).
    this.logger.debug(`capture(${instanceName}): extracted=${events.length} payload=${JSON.stringify(payload).slice(0, 1500)}`);
    for (const event of events) await this.persist(connection, event);
    return { accepted: true, events: events.length };
  }

  private async resolveConnection(instanceName: string): Promise<ResolvedConnection | null> {
    const { baseUrl, serviceKey } = this.serviceConfig();
    const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}` };
    const response = await fetch(
      `${baseUrl}/rest/v1/whatsapp_connections?select=id,org_id&instance_name=eq.${encodeURIComponent(instanceName)}&limit=1`,
      { headers, signal: AbortSignal.timeout(8000) }
    );
    if (!response.ok) {
      this.logger.error(`resolveConnection(${instanceName}) falhou (${response.status}): ${await response.text()}`);
      throw new ServiceUnavailableException("Falha ao identificar conexão");
    }
    const rows = await response.json() as Array<{ id: string; org_id: string }>;
    const row = rows[0];
    return row ? { orgId: row.org_id, connectionId: row.id } : null;
  }

  private async getWebhookSecret(connectionId: string): Promise<string> {
    const { baseUrl, serviceKey } = this.serviceConfig();
    const response = await fetch(`${baseUrl}/rest/v1/rpc/get_whatsapp_access_token`, {
      method: "POST",
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
      body: JSON.stringify({ p_connection_id: connectionId }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      this.logger.error(`getWebhookSecret(${connectionId}) falhou (${response.status}): ${await response.text()}`);
      throw new ServiceUnavailableException("Falha ao ler segredo do webhook");
    }
    return await response.json() as string;
  }

  private async persist(connection: ResolvedConnection, event: ExtractedEvolutionMessage) {
    const sanitizedPayload = { ...event.sanitizedPayload };
    const rawBase64 = sanitizedPayload._media_base64 as string | undefined;
    const rawMimeType = sanitizedPayload._media_mimetype as string | undefined;
    delete sanitizedPayload._media_base64;
    delete sanitizedPayload._media_mimetype;
    if (rawBase64) {
      try {
        sanitizedPayload.media_object_key = await this.uploadMedia(connection.orgId, connection.connectionId, rawBase64, rawMimeType);
        sanitizedPayload.media_mime_type = rawMimeType ?? null;
      } catch (error) {
        // Não derruba a mensagem inteira por causa disso — sem mídia ela
        // ainda vale a pena gravar (aparece o rótulo do tipo, só sem player).
        this.logger.error(`Falha ao enviar mídia da Evolution pro Storage: ${(error as Error).message}`);
      }
    }

    const { baseUrl, serviceKey } = this.serviceConfig();
    const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };
    const payloadText = JSON.stringify(sanitizedPayload);
    const insertResponse = await fetch(`${baseUrl}/rest/v1/whatsapp_webhook_events`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        org_id: connection.orgId,
        connection_id: connection.connectionId,
        event_name: "messages",
        provider_event_id: event.providerEventId,
        payload_hash: createHash("sha256").update(payloadText).digest("hex"),
        sanitized_payload: sanitizedPayload
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (insertResponse.status === 409) return;
    if (!insertResponse.ok) {
      this.logger.error(`persist evento da Evolution falhou (${insertResponse.status}): ${await insertResponse.text()}`);
      throw new ServiceUnavailableException("Falha ao registrar evento da Evolution");
    }
  }

  private async uploadMedia(orgId: string, connectionId: string, base64Data: string, mimeType: string | undefined): Promise<string> {
    const { baseUrl, serviceKey } = this.serviceConfig();
    const objectPath = `${orgId}/${connectionId}/${randomUUID()}.${extensionFor(mimeType)}`;
    const response = await fetch(`${baseUrl}/storage/v1/object/whatsapp-media/${objectPath}`, {
      method: "POST",
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": mimeType || "application/octet-stream" },
      body: Buffer.from(base64Data, "base64"),
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`upload falhou (${response.status}): ${(await response.text()).slice(0, 300)}`);
    return objectPath;
  }
}
