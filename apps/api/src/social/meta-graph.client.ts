import { BadGatewayException, Injectable, ServiceUnavailableException } from "@nestjs/common";

export type GraphPage = {
  id: string;
  name: string;
  accessToken: string;
  instagramBusinessAccountId: string | null;
  instagramUsername: string | null;
};

type TokenResponse = { access_token?: string; error?: { message?: string } };
type PageListResponse = { data?: Array<{ id?: string; name?: string; access_token?: string; instagram_business_account?: { id?: string } }> };
type InstagramAccountResponse = { username?: string };
type ContainerResponse = { id?: string; error?: { message?: string } };
type ContainerStatusResponse = { status_code?: string };
type PublishResponse = { id?: string; error?: { message?: string } };

// Cliente fino pra Graph API da Meta (Instagram + Facebook) — mesmo
// espírito de EvolutionClient (apps/api/src/whatsapp/evolution.client.ts):
// injectable, um wrapper de fetch central, métodos públicos curtos. Ao
// contrário do EvolutionClient, os tokens aqui são por conexão (vindos do
// Vault), não uma chave global configurada — por isso são parâmetro, não
// lidos de env var dentro da classe.
@Injectable()
export class MetaGraphClient {
  private graphVersion() {
    return process.env.META_GRAPH_API_VERSION ?? "v25.0";
  }

  private appCredentials() {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) throw new ServiceUnavailableException("App da Meta não configurado");
    return { appId, appSecret };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`https://graph.facebook.com/${this.graphVersion()}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
      signal: AbortSignal.timeout(15000)
    });
    const body = await response.json() as T & { error?: { message?: string } };
    if (!response.ok) {
      throw new BadGatewayException(body?.error?.message ?? `Falha na Graph API (${response.status})`);
    }
    return body;
  }

  async exchangeCodeForToken(code: string, redirectUri: string): Promise<string> {
    const { appId, appSecret } = this.appCredentials();
    const body = await this.request<TokenResponse>(
      `/oauth/access_token?${new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code }).toString()}`
    );
    if (!body.access_token) throw new BadGatewayException("A Meta não retornou um token de acesso");
    return body.access_token;
  }

  // Tokens de usuário de curta duração (~1-2h) precisam virar de longa
  // duração (~60 dias) — os tokens de Página derivados de um token de
  // longa duração praticamente não expiram, o que é o que queremos pra
  // publicação agendada funcionar sem reconectar toda hora.
  async exchangeForLongLivedToken(shortLivedToken: string): Promise<string> {
    const { appId, appSecret } = this.appCredentials();
    const body = await this.request<TokenResponse>(
      `/oauth/access_token?${new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortLivedToken
      }).toString()}`
    );
    if (!body.access_token) throw new BadGatewayException("Não foi possível obter um token de longa duração");
    return body.access_token;
  }

  async listManagedPages(userToken: string): Promise<GraphPage[]> {
    const body = await this.request<PageListResponse>(
      `/me/accounts?fields=id,name,access_token,instagram_business_account&limit=100&access_token=${encodeURIComponent(userToken)}`
    );
    const pages = body.data ?? [];
    const withInstagram = await Promise.all(
      pages.map(async (page) => {
        const igAccountId = page.instagram_business_account?.id ?? null;
        let igUsername: string | null = null;
        if (igAccountId && page.access_token) {
          const igAccount = await this.request<InstagramAccountResponse>(
            `/${encodeURIComponent(igAccountId)}?fields=username&access_token=${encodeURIComponent(page.access_token)}`
          );
          igUsername = igAccount.username ?? null;
        }
        return {
          id: page.id ?? "",
          name: page.name ?? "",
          accessToken: page.access_token ?? "",
          instagramBusinessAccountId: igAccountId,
          instagramUsername: igUsername
        };
      })
    );
    return withInstagram.filter((page) => page.id && page.accessToken);
  }

  // Publicar no Instagram é em duas etapas: cria um container de mídia,
  // depois publica o container (a Meta processa a imagem de forma
  // assíncrona por trás — por isso getContainerStatus existe, embora pra
  // imagens simples geralmente já vem pronta na primeira checagem).
  async createInstagramMediaContainer(igUserId: string, pageAccessToken: string, imageUrl: string, caption: string): Promise<string> {
    const body = await this.request<ContainerResponse>(`/${encodeURIComponent(igUserId)}/media`, {
      method: "POST",
      body: JSON.stringify({ image_url: imageUrl, caption, access_token: pageAccessToken })
    });
    if (!body.id) throw new BadGatewayException("Não foi possível criar o container de mídia");
    return body.id;
  }

  async getContainerStatus(containerId: string, pageAccessToken: string): Promise<string> {
    const body = await this.request<ContainerStatusResponse>(
      `/${encodeURIComponent(containerId)}?fields=status_code&access_token=${encodeURIComponent(pageAccessToken)}`
    );
    return body.status_code ?? "UNKNOWN";
  }

  async publishInstagramContainer(igUserId: string, pageAccessToken: string, containerId: string): Promise<string> {
    const body = await this.request<PublishResponse>(`/${encodeURIComponent(igUserId)}/media_publish`, {
      method: "POST",
      body: JSON.stringify({ creation_id: containerId, access_token: pageAccessToken })
    });
    if (!body.id) throw new BadGatewayException("Não foi possível publicar o container de mídia");
    return body.id;
  }

  async publishFacebookPost(pageId: string, pageAccessToken: string, message: string, imageUrl?: string | null): Promise<string> {
    const path = imageUrl ? `/${encodeURIComponent(pageId)}/photos` : `/${encodeURIComponent(pageId)}/feed`;
    const payload = imageUrl
      ? { url: imageUrl, caption: message, access_token: pageAccessToken }
      : { message, access_token: pageAccessToken };
    const body = await this.request<PublishResponse>(path, { method: "POST", body: JSON.stringify(payload) });
    if (!body.id) throw new BadGatewayException("Não foi possível publicar no Facebook");
    return body.id;
  }
}
