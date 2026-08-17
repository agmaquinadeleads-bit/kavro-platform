import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";

type MetaMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  referral?: Record<string, unknown>;
  text?: { body?: string };
};

type MetaChange = {
  field?: string;
  value?: {
    metadata?: { phone_number_id?: string; display_phone_number?: string };
    messages?: MetaMessage[];
  };
};

type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{ id?: string; changes?: MetaChange[] }>;
};

const allowedReferralKeys = ["source_url", "source_type", "source_id", "headline", "body", "media_type", "ctwa_clid"] as const;

function boundedString(value: unknown, maximum: number) {
  return typeof value === "string" && value.length > 0 ? value.slice(0, maximum) : undefined;
}

export function sanitizeMetaReferral(referral: Record<string, unknown> | undefined) {
  if (!referral) return {};
  const sanitized: Record<string, string> = {};
  for (const key of allowedReferralKeys) {
    const value = boundedString(referral[key], key === "ctwa_clid" ? 1000 : 2000);
    if (value) sanitized[key] = value;
  }
  return sanitized;
}

export function extractMetaMessages(payload: MetaWebhookPayload) {
  const messages: Array<{
    phoneNumberId: string;
    businessAccountId?: string;
    providerEventId: string;
    sanitizedPayload: Record<string, unknown>;
  }> = [];

  if (payload.object !== "whatsapp_business_account") return messages;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const phoneNumberId = boundedString(change.value?.metadata?.phone_number_id, 160);
      if (!phoneNumberId) continue;
      for (const message of change.value?.messages ?? []) {
        const providerEventId = boundedString(message.id, 255);
        if (!providerEventId) continue;
        messages.push({
          phoneNumberId,
          businessAccountId: boundedString(entry.id, 160),
          providerEventId,
          sanitizedPayload: {
            from: boundedString(message.from, 32),
            timestamp: boundedString(message.timestamp, 32),
            type: boundedString(message.type, 80) ?? "unknown",
            display_phone_number: boundedString(change.value?.metadata?.display_phone_number, 32),
            // Só texto na v1 — mídia (imagem/áudio/documento) fica pra depois.
            text: boundedString(message.text?.body, 20000),
            referral: sanitizeMetaReferral(message.referral)
          }
        });
      }
    }
  }
  return messages;
}

@Injectable()
export class MetaWebhookService {
  verifyChallenge(mode: unknown, verifyToken: unknown, challenge: unknown) {
    const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (!expectedToken) throw new ServiceUnavailableException("Webhook oficial da Meta não configurado");
    if (mode !== "subscribe" || typeof verifyToken !== "string" || typeof challenge !== "string" || !this.safeEqual(verifyToken, expectedToken)) {
      throw new UnauthorizedException("Verificação do webhook recusada");
    }
    return challenge;
  }

  validateSignature(rawBody: Buffer, signature: string | undefined) {
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) throw new ServiceUnavailableException("Assinatura Meta não configurada");
    if (!signature?.startsWith("sha256=")) throw new UnauthorizedException("Assinatura Meta ausente");
    const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
    if (!this.safeEqual(signature, expected)) throw new UnauthorizedException("Assinatura Meta inválida");
  }

  async capture(payload: MetaWebhookPayload) {
    const events = extractMetaMessages(payload);
    for (const event of events) await this.persist(event);
    return { accepted: true, events: events.length };
  }

  private safeEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private async persist(event: ReturnType<typeof extractMetaMessages>[number]) {
    const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!baseUrl || !serviceKey) throw new ServiceUnavailableException("Persistência segura do webhook não configurada");
    const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };
    const credentialsResponse = await fetch(
      `${baseUrl}/rest/v1/whatsapp_provider_credentials?select=org_id,connection_id&external_phone_number_id=eq.${encodeURIComponent(event.phoneNumberId)}&limit=1`,
      { headers, signal: AbortSignal.timeout(8000) }
    );
    if (!credentialsResponse.ok) throw new ServiceUnavailableException("Falha ao identificar conexão oficial");
    const credentials = await credentialsResponse.json() as Array<{ org_id: string; connection_id: string }>;
    const connection = credentials[0];
    if (!connection) return;

    const payloadText = JSON.stringify(event.sanitizedPayload);
    const insertResponse = await fetch(`${baseUrl}/rest/v1/whatsapp_webhook_events`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        org_id: connection.org_id,
        connection_id: connection.connection_id,
        event_name: "messages",
        provider_event_id: event.providerEventId,
        payload_hash: createHash("sha256").update(payloadText).digest("hex"),
        sanitized_payload: event.sanitizedPayload
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (insertResponse.status === 409) return;
    if (!insertResponse.ok) throw new ServiceUnavailableException("Falha ao registrar evento oficial");
  }
}
