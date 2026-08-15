import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { MetaGraphClient } from "./meta-graph.client";

type OutboxItem = {
  id: number | null;
  org_id: string | null;
  content_post_id: string | null;
  provider: "instagram" | "facebook" | null;
  attempts: number | null;
};

// claim_content_publish_outbox_item() devolve uma linha toda nula quando
// não tem nada pronto pra reivindicar — OutboxItem espelha isso. Depois
// da checagem de nulos em drainOnce(), construímos este tipo (campos
// garantidos, sem "as"/cast) pro resto do fluxo trabalhar sem checar null
// de novo em cada uso.
type ClaimedOutboxItem = {
  id: number;
  orgId: string;
  contentPostId: string;
  provider: "instagram" | "facebook";
  attempts: number;
};

type ContentPost = { id: string; brand_id: string; caption: string | null; image_url: string | null };
type SocialConnection = { id: string; external_account_id: string };

const MAX_ATTEMPTS = 5;
const WORKER_ID = `worker-${randomUUID()}`;

// Drena content_publish_outbox e publica de verdade no Instagram/Facebook
// — mesmo desenho do whatsapp_outbox (packages/database/migrations/
// 0010_whatsapp_foundation.sql), que existia sem nenhum consumidor. Usa
// fetch direto contra o PostgREST com a service role key, mesmo padrão já
// usado em meta-onboarding.service.ts (não há client supabase-js neste
// backend).
@Injectable()
export class ContentPublishWorkerService {
  private readonly logger = new Logger(ContentPublishWorkerService.name);

  constructor(private readonly graph: MetaGraphClient) {}

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

  private async selectMany<T>(table: string, query: string): Promise<T[]> {
    const response = await fetch(`${this.baseUrl()}/rest/v1/${table}?${query}`, {
      headers: this.serviceHeaders(),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`Consulta a ${table} falhou (${response.status}): ${await response.text()}`);
    return await response.json() as T[];
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

  @Cron(CronExpression.EVERY_MINUTE)
  async drainOnce() {
    if (!this.configured()) return;

    // Processa um item por disparo — simples e suficiente pro volume
    // esperado de posts agendados; se o volume crescer, trocar por um
    // laço "enquanto ainda tiver item pronto" é uma mudança pequena aqui.
    let raw: OutboxItem;
    try {
      raw = await this.rpc<OutboxItem>("claim_content_publish_outbox_item", { p_worker_id: WORKER_ID });
    } catch (error) {
      this.logger.error(`Falha ao reivindicar item da fila: ${(error as Error).message}`);
      return;
    }
    if (!raw?.id || !raw.content_post_id || !raw.provider || !raw.org_id) return;

    const item: ClaimedOutboxItem = {
      id: raw.id,
      orgId: raw.org_id,
      contentPostId: raw.content_post_id,
      provider: raw.provider,
      attempts: raw.attempts ?? 1
    };

    try {
      await this.publishItem(item);
    } catch (error) {
      await this.handleFailure(item, (error as Error).message);
    }
  }

  private async publishItem(item: ClaimedOutboxItem) {
    const post = await this.selectOne<ContentPost>(
      "content_posts",
      `id=eq.${item.contentPostId}&org_id=eq.${item.orgId}&select=id,brand_id,caption,image_url`
    );
    if (!post) throw new Error("Post não encontrado");
    if (!post.image_url) throw new Error("Post sem imagem gerada");

    const connection = await this.selectOne<SocialConnection>(
      "social_connections",
      `org_id=eq.${item.orgId}&brand_id=eq.${post.brand_id}&provider=eq.${item.provider}&status=eq.connected&select=id,external_account_id`
    );
    if (!connection) throw new Error(`Nenhuma conexão de ${item.provider} ativa para essa marca`);

    const accessToken = await this.rpc<string>("get_social_access_token", { p_connection_id: connection.id });

    if (item.provider === "instagram") {
      const containerId = await this.graph.createInstagramMediaContainer(
        connection.external_account_id,
        accessToken,
        post.image_url,
        post.caption ?? ""
      );
      await this.waitForContainerReady(containerId, accessToken);
      await this.graph.publishInstagramContainer(connection.external_account_id, accessToken, containerId);
    } else {
      await this.graph.publishFacebookPost(connection.external_account_id, accessToken, post.caption ?? "", post.image_url);
    }

    await this.patch("content_publish_outbox", `id=eq.${item.id}`, { status: "sent" });
    await this.finalizePostStatusIfDone(item.orgId, item.contentPostId);
  }

  // Containers de mídia do Instagram são processados de forma assíncrona
  // pela Meta — espera ficar pronto antes de publicar (imagens simples
  // costumam ficar prontas na primeira checagem, mas o processamento não
  // é garantido ser síncrono).
  private async waitForContainerReady(containerId: string, accessToken: string) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const status = await this.graph.getContainerStatus(containerId, accessToken);
      if (status === "FINISHED") return;
      if (status === "ERROR" || status === "EXPIRED") throw new Error(`Falha ao processar a mídia (${status})`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error("Tempo esgotado esperando o Instagram processar a mídia");
  }

  private async handleFailure(item: ClaimedOutboxItem, errorMessage: string) {
    this.logger.warn(`Falha ao publicar item ${item.id} (tentativa ${item.attempts}): ${errorMessage}`);
    const isDeadLetter = item.attempts >= MAX_ATTEMPTS;
    const backoffMinutes = Math.min(60, 2 ** item.attempts);
    await this.patch("content_publish_outbox", `id=eq.${item.id}`, {
      status: isDeadLetter ? "dead_letter" : "failed",
      last_error_message: errorMessage.slice(0, 2000),
      next_attempt_at: new Date(Date.now() + backoffMinutes * 60_000).toISOString()
    });
    if (isDeadLetter) await this.finalizePostStatusIfDone(item.orgId, item.contentPostId);
  }

  // Um post pode ter mais de um item na fila (um por rede-alvo) — só
  // marca o post como published/failed quando não sobrar nenhum item
  // ainda pendente/retentando.
  private async finalizePostStatusIfDone(orgId: string, contentPostId: string) {
    const items = await this.selectMany<{ status: string }>(
      "content_publish_outbox",
      `org_id=eq.${orgId}&content_post_id=eq.${contentPostId}&select=status`
    );
    const stillPending = items.some((item) => item.status === "pending" || item.status === "processing" || item.status === "failed");
    if (stillPending) return;

    const allSent = items.every((item) => item.status === "sent");
    await this.patch("content_posts", `id=eq.${contentPostId}&org_id=eq.${orgId}`, allSent
      ? { status: "published", published_at: new Date().toISOString() }
      : { status: "failed" });
  }
}
