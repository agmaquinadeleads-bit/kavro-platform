import { Injectable, ServiceUnavailableException } from "@nestjs/common";

const INSTANCE_NAME = /^[a-z0-9][a-z0-9_-]{7,79}$/;

@Injectable()
export class EvolutionClient {
  isConfigured() { return Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY); }

  private configuration() {
    const url = process.env.EVOLUTION_API_URL?.replace(/\/$/, "");
    const key = process.env.EVOLUTION_API_KEY;
    if (!url || !key) throw new ServiceUnavailableException("Provedor WhatsApp não configurado");
    return { url, key };
  }

  private instancePath(instanceName: string) {
    if (!INSTANCE_NAME.test(instanceName)) throw new Error("Invalid internal instance name");
    return encodeURIComponent(instanceName);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const { url, key } = this.configuration();
    const response = await fetch(`${url}${path}`, { ...init, headers: { "content-type": "application/json", apikey: key, ...init?.headers }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new ServiceUnavailableException(`Falha temporária no provedor (${response.status})`);
    return await response.json() as T;
  }

  createInstance(instanceName: string, webhookUrl: string, webhookSecret: string) {
    // base64:true manda a mídia (áudio, imagem etc.) já decodificada dentro
    // do próprio payload do webhook — sem isso não tem como escutar os
    // áudios recebidos no CRM, só o texto das mensagens chega.
    return this.request<Record<string, unknown>>("/instance/create", { method: "POST", body: JSON.stringify({ instanceName, integration: "WHATSAPP-BAILEYS", qrcode: true, webhook: { enabled: true, url: webhookUrl, webhookByEvents: false, base64: true, headers: { "X-Kavro-Webhook-Secret": webhookSecret }, events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "MESSAGES_DELETE", "SEND_MESSAGE", "CONNECTION_UPDATE"] } }) });
  }

  connect(instanceName: string) { return this.request<Record<string, unknown>>(`/instance/connect/${this.instancePath(instanceName)}`); }
  connectionState(instanceName: string) { return this.request<Record<string, unknown>>(`/instance/connectionState/${this.instancePath(instanceName)}`); }
  logout(instanceName: string) { return this.request<Record<string, unknown>>(`/instance/logout/${this.instancePath(instanceName)}`, { method: "DELETE" }); }
  sendText(instanceName: string, number: string, text: string) { return this.request<Record<string, unknown>>(`/message/sendText/${this.instancePath(instanceName)}`, { method: "POST", body: JSON.stringify({ number, text }) }); }

  // Imagem enviada como mídia normal (mediatype "image", com legenda
  // opcional) — endpoint separado do de texto na API da Evolution.
  sendImage(instanceName: string, number: string, base64: string, mimetype: string, caption: string | undefined) {
    return this.request<Record<string, unknown>>(`/message/sendMedia/${this.instancePath(instanceName)}`, {
      method: "POST",
      body: JSON.stringify({ number, mediatype: "image", mimetype, media: base64, caption: caption || undefined })
    });
  }

  // Áudio vai por um endpoint próprio (nota de voz / ptt), não pelo
  // sendMedia genérico.
  sendAudio(instanceName: string, number: string, base64: string) {
    return this.request<Record<string, unknown>>(`/message/sendWhatsAppAudio/${this.instancePath(instanceName)}`, {
      method: "POST",
      body: JSON.stringify({ number, audio: base64 })
    });
  }
}
