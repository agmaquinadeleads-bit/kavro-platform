import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { KavroSession } from "../auth/session";
import { MetaGraphClient, type GraphPage } from "./meta-graph.client";

type ListPagesInput = { code: string; redirectUri: string };
type CompleteInput = { selectionToken: string; brandId: string; pageId: string; provider: "instagram" | "facebook" };

type CachedSelection = {
  orgId: string;
  userId: string;
  pages: GraphPage[];
  expiresAt: number;
};

const SELECTION_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class SocialOnboardingService {
  constructor(private readonly graph: MetaGraphClient) {}

  // Cache em memória do processo, só pra segurar os tokens de Página entre
  // a listagem (listPages) e a confirmação de qual conectar
  // (completeConnection) — o token de Página nunca é exposto ao client,
  // só o essencial pra exibir a lista de escolha. Simplificação de MVP:
  // não sobrevive a restart nem funciona com mais de uma réplica do
  // backend; se isso virar problema, precisa virar uma tabela com TTL.
  private readonly pendingSelections = new Map<string, CachedSelection>();

  readiness() {
    const metaAppConfigured = Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
    const credentialVaultConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
    return { metaAppConfigured, credentialVaultConfigured, ready: metaAppConfigured && credentialVaultConfigured };
  }

  private evictExpiredSelections() {
    const now = Date.now();
    for (const [token, selection] of this.pendingSelections) {
      if (selection.expiresAt < now) this.pendingSelections.delete(token);
    }
  }

  // Etapa 1: troca o "code" do diálogo de login da Meta por um token de
  // usuário de longa duração, lista as Páginas gerenciadas (com a conta do
  // Instagram vinculada, se houver) — devolve só o necessário pra exibir
  // a lista de escolha, guardando os tokens de verdade só no servidor.
  async listPages(session: KavroSession, input: ListPagesInput) {
    if (session.role === "member") throw new BadRequestException("Somente administradores podem conectar redes sociais");
    if (!input.code || !input.redirectUri) throw new BadRequestException("Retorno inválido da Meta");

    const shortLivedToken = await this.graph.exchangeCodeForToken(input.code, input.redirectUri);
    const longLivedToken = await this.graph.exchangeForLongLivedToken(shortLivedToken);
    const pages = await this.graph.listManagedPages(longLivedToken);

    this.evictExpiredSelections();
    const selectionToken = randomUUID();
    this.pendingSelections.set(selectionToken, {
      orgId: session.organizationId,
      userId: session.userId,
      pages,
      expiresAt: Date.now() + SELECTION_TTL_MS
    });

    return {
      selectionToken,
      pages: pages.map((page) => ({
        pageId: page.id,
        pageName: page.name,
        hasInstagram: Boolean(page.instagramBusinessAccountId),
        instagramUsername: page.instagramUsername
      }))
    };
  }

  // Etapa 2: usuário escolheu qual Página (e Instagram ou Facebook) vai
  // representar a marca — grava a conexão e o token via RPC no Vault
  // (complete_social_connection, migration 0022), mesmo padrão do
  // complete_meta_whatsapp_connection já usado pro WhatsApp.
  async completeConnection(session: KavroSession, input: CompleteInput) {
    if (session.role === "member") throw new BadRequestException("Somente administradores podem conectar redes sociais");

    this.evictExpiredSelections();
    const selection = this.pendingSelections.get(input.selectionToken);
    if (!selection || selection.orgId !== session.organizationId || selection.userId !== session.userId) {
      throw new BadRequestException("Sessão de conexão expirada — tente conectar novamente");
    }

    const page = selection.pages.find((candidate) => candidate.id === input.pageId);
    if (!page) throw new BadRequestException("Página não encontrada na lista retornada pela Meta");

    if (input.provider === "instagram" && !page.instagramBusinessAccountId) {
      throw new BadRequestException("Essa página não tem uma conta comercial do Instagram vinculada");
    }

    const externalAccountId = input.provider === "instagram" ? (page.instagramBusinessAccountId as string) : page.id;
    const externalAccountName = input.provider === "instagram" ? (page.instagramUsername ?? page.name) : page.name;

    const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!baseUrl || !serviceKey) throw new ServiceUnavailableException("Cofre de credenciais não configurado");

    const stored = await fetch(`${baseUrl}/rest/v1/rpc/complete_social_connection`, {
      method: "POST",
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        p_org_id: session.organizationId,
        p_user_id: session.userId,
        p_brand_id: input.brandId,
        p_provider: input.provider,
        p_external_account_id: externalAccountId,
        p_external_account_name: externalAccountName,
        p_access_token: page.accessToken
      }),
      signal: AbortSignal.timeout(12000)
    });
    if (!stored.ok) throw new ServiceUnavailableException("Não foi possível guardar a conexão com segurança");
    const connectionId = await stored.json() as string;

    return { status: "connected", connectionId, provider: input.provider, externalAccountName };
  }
}
