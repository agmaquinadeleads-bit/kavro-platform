import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { KavroSession } from "../auth/session";
import { EvolutionClient } from "./evolution.client";

type EvolutionConnectResult = { connectionId: string; qrCode: string | null; status: string };
type ConnectionRow = { id: string; instance_name: string; status: string };
type EvolutionQrResponse = { base64?: string; code?: string };
type EvolutionStateResponse = { instance?: { state?: string } };

// Conexão via QR Code (Evolution/Baileys, self-hosted) — mesmo padrão de
// meta-onboarding.service.ts (fetch direto contra o PostgREST com a
// service role key, sem client supabase-js neste backend), mas sem OAuth:
// aqui é o backend que gera o nome opaco da instância e o segredo do
// webhook, não o usuário.
@Injectable()
export class EvolutionConnectionService {
  private readonly logger = new Logger(EvolutionConnectionService.name);

  constructor(private readonly evolution: EvolutionClient) {}

  private baseUrl() {
    return process.env.SUPABASE_URL!.replace(/\/$/, "");
  }

  private serviceHeaders() {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
  }

  async createConnection(session: KavroSession, displayName: string): Promise<EvolutionConnectResult> {
    if (session.role === "member") throw new BadRequestException("Somente administradores podem conectar números");
    if (!this.evolution.isConfigured()) throw new ServiceUnavailableException("Provedor WhatsApp não configurado");
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new ServiceUnavailableException("Cofre de credenciais não configurado");
    const apiPublicUrl = process.env.KAVRO_API_PUBLIC_URL?.replace(/\/$/, "");
    if (!apiPublicUrl) throw new ServiceUnavailableException("URL pública da API não configurada");

    const trimmedName = displayName.trim();
    if (!trimmedName) throw new BadRequestException("Informe um nome pra essa conexão");

    const instanceName = `evo-${randomBytes(12).toString("hex")}`;
    const webhookSecret = randomBytes(32).toString("hex");
    // Todas as rotas da API têm o prefixo global "v1" (ver main.ts,
    // app.setGlobalPrefix("v1")) — inclusive esse webhook.
    const webhookUrl = `${apiPublicUrl}/v1/webhooks/evolution/whatsapp/${instanceName}`;

    const stored = await fetch(`${this.baseUrl()}/rest/v1/rpc/complete_evolution_whatsapp_connection`, {
      method: "POST",
      headers: this.serviceHeaders(),
      body: JSON.stringify({
        p_org_id: session.organizationId,
        p_user_id: session.userId,
        p_display_name: trimmedName,
        p_instance_name: instanceName,
        p_webhook_secret: webhookSecret
      }),
      signal: AbortSignal.timeout(12000)
    });
    if (!stored.ok) throw new ServiceUnavailableException("Não foi possível guardar a conexão com segurança");
    const connectionId = await stored.json() as string;

    // A conexão já está gravada nesse ponto (com o segredo do webhook
    // vaultado) — se a Evolution falhar daqui pra frente, o usuário pode
    // tentar de novo consultando o status; não desfazemos a linha criada.
    await this.evolution.createInstance(instanceName, webhookUrl, webhookSecret);
    const connectResponse = await this.evolution.connect(instanceName) as EvolutionQrResponse;
    const qrCode = connectResponse.base64 ?? connectResponse.code ?? null;

    return { connectionId, qrCode, status: "qr_code" };
  }

  async getStatus(session: KavroSession, connectionId: string) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new ServiceUnavailableException("Cofre de credenciais não configurado");

    const connection = await this.selectConnection(session.organizationId, connectionId);
    if (!connection) throw new BadRequestException("Conexão não encontrada");

    const state = await this.evolution.connectionState(connection.instance_name) as EvolutionStateResponse;
    // Log temporário — não dá pra testar contra uma instância real da
    // Evolution neste ambiente, então isso ajuda a confirmar o formato
    // exato da resposta se o mapeamento de estado precisar de ajuste.
    this.logger.debug(`connectionState(${connection.instance_name}): ${JSON.stringify(state)}`);
    const status = this.mapState(state.instance?.state);

    if (status !== connection.status) {
      const patchBody: Record<string, unknown> = { status };
      if (status === "connected") patchBody.last_connected_at = new Date().toISOString();
      const response = await fetch(`${this.baseUrl()}/rest/v1/whatsapp_connections?id=eq.${encodeURIComponent(connectionId)}`, {
        method: "PATCH",
        headers: this.serviceHeaders(),
        body: JSON.stringify(patchBody),
        signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) throw new ServiceUnavailableException("Falha ao atualizar o status da conexão");
    }

    return { status };
  }

  // Pede um QR Code novo pra uma instância que já existe (ex: o primeiro
  // expirou antes de ser lido) — sem criar uma conexão nova do zero.
  async regenerateQr(session: KavroSession, connectionId: string): Promise<{ qrCode: string | null }> {
    if (session.role === "member") throw new BadRequestException("Somente administradores podem gerenciar conexões");
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new ServiceUnavailableException("Cofre de credenciais não configurado");

    const connection = await this.selectConnection(session.organizationId, connectionId);
    if (!connection) throw new BadRequestException("Conexão não encontrada");
    if (connection.status === "connected") throw new BadRequestException("Essa conexão já está ativa");

    const connectResponse = await this.evolution.connect(connection.instance_name) as EvolutionQrResponse;
    const qrCode = connectResponse.base64 ?? connectResponse.code ?? null;
    return { qrCode };
  }

  // Remove a conexão (qualquer provider — Evolution ou Meta Cloud API).
  // whatsapp_provider_credentials/whatsapp_conversations/whatsapp_messages
  // têm "on delete cascade" pra connection_id (0010_whatsapp_foundation.sql),
  // então uma linha só já limpa tudo.
  async deleteConnection(session: KavroSession, connectionId: string): Promise<void> {
    if (session.role === "member") throw new BadRequestException("Somente administradores podem remover conexões");
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new ServiceUnavailableException("Cofre de credenciais não configurado");

    const response = await fetch(
      `${this.baseUrl()}/rest/v1/whatsapp_connections?id=eq.${encodeURIComponent(connectionId)}&org_id=eq.${encodeURIComponent(session.organizationId)}`,
      { method: "DELETE", headers: this.serviceHeaders(), signal: AbortSignal.timeout(12000) }
    );
    if (!response.ok) {
      this.logger.error(`deleteConnection(${connectionId}) falhou (${response.status}): ${await response.text()}`);
      throw new ServiceUnavailableException("Falha ao remover a conexão");
    }
  }

  private mapState(rawState: string | undefined): "connecting" | "qr_code" | "connected" | "disconnected" | "error" {
    if (rawState === "open") return "connected";
    if (rawState === "connecting") return "connecting";
    if (rawState === "close") return "disconnected";
    // Formato não reconhecido (ex: shape da resposta diferente do
    // esperado) — não declara falha sem ter certeza, isso derrubaria o QR
    // à toa. Mantém como "conectando"; o log acima expõe a causa real se
    // isso persistir.
    return "connecting";
  }

  private async selectConnection(orgId: string, connectionId: string): Promise<ConnectionRow | null> {
    const response = await fetch(
      `${this.baseUrl()}/rest/v1/whatsapp_connections?id=eq.${encodeURIComponent(connectionId)}&org_id=eq.${encodeURIComponent(orgId)}&select=id,instance_name,status&limit=1`,
      { headers: this.serviceHeaders(), signal: AbortSignal.timeout(12000) }
    );
    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Falha ao consultar whatsapp_connections (${response.status}): ${body}`);
      throw new ServiceUnavailableException("Falha ao consultar a conexão");
    }
    const rows = await response.json() as ConnectionRow[];
    return rows[0] ?? null;
  }
}
