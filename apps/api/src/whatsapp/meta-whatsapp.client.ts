import { BadGatewayException, Injectable } from "@nestjs/common";

type SendMessageResponse = { messages?: Array<{ id?: string }>; error?: { message?: string } };

// Cliente fino pra Graph API da Meta (WhatsApp Cloud API) — mesmo espírito
// de MetaGraphClient (apps/api/src/social/meta-graph.client.ts): injectable,
// wrapper de fetch central, token por conexão vindo do Vault (parâmetro,
// não lido de env var).
@Injectable()
export class MetaWhatsappClient {
  private graphVersion() {
    return process.env.META_GRAPH_API_VERSION ?? "v25.0";
  }

  private async request<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`https://graph.facebook.com/${this.graphVersion()}${path}`, {
      ...init,
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}`, ...init?.headers },
      signal: AbortSignal.timeout(15000)
    });
    const body = await response.json() as T & { error?: { message?: string } };
    if (!response.ok) {
      throw new BadGatewayException(body?.error?.message ?? `Falha na Graph API (${response.status})`);
    }
    return body;
  }

  async sendText(phoneNumberId: string, accessToken: string, to: string, text: string): Promise<string> {
    const body = await this.request<SendMessageResponse>(`/${encodeURIComponent(phoneNumberId)}/messages`, accessToken, {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } })
    });
    const externalId = body.messages?.[0]?.id;
    if (!externalId) throw new BadGatewayException("A Meta não confirmou o envio da mensagem");
    return externalId;
  }
}
