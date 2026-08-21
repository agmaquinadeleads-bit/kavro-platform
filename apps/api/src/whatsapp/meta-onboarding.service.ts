import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { KavroSession } from "../auth/session";

type CompleteInput = { code: string; phoneNumberId: string; businessAccountId: string };
type TokenResponse = { access_token?: string };
type PhoneResponse = { id?: string; display_phone_number?: string; verified_name?: string; error?: unknown };
type PhoneListResponse = { data?: Array<{ id?: string }> };

@Injectable()
export class MetaOnboardingService {
  readiness() {
    const metaAppConfigured = Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_EMBEDDED_SIGNUP_CONFIG_ID);
    const credentialVaultConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
    const webhookConfigured = Boolean(process.env.META_APP_SECRET && process.env.META_WEBHOOK_VERIFY_TOKEN && credentialVaultConfigured);
    return {
      metaAppConfigured,
      credentialVaultConfigured,
      webhookConfigured,
      ready: metaAppConfigured && credentialVaultConfigured && webhookConfigured,
      graphVersion: process.env.META_GRAPH_API_VERSION ?? "v25.0"
    };
  }

  async complete(session: KavroSession, input: CompleteInput) {
    if (session.role === "member") throw new BadRequestException("Somente administradores podem conectar números");
    if (!input.code || !/^\d{3,30}$/.test(input.phoneNumberId) || !/^\d{3,30}$/.test(input.businessAccountId)) {
      throw new BadRequestException("Retorno inválido do cadastro da Meta");
    }

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const graphVersion = process.env.META_GRAPH_API_VERSION ?? "v25.0";
    if (!appId || !appSecret) throw new ServiceUnavailableException("Cadastro da Meta não configurado");
    const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!baseUrl || !serviceKey) throw new ServiceUnavailableException("Cofre de credenciais não configurado");

    // Checagem "de UX" antes de trocar o code OAuth (uso único) com a
    // Meta — a trava de verdade fica dentro de
    // complete_meta_whatsapp_connection (0042_billing_enforcement.sql).
    // Limite nulo (org sem organization_billing, ou nunca vinculada ao
    // Stripe) = sem limite.
    await this.assertWhatsappNumberLimitNotReached(baseUrl, serviceKey, session.organizationId);

    const tokenResponse = await fetch(`https://graph.facebook.com/${graphVersion}/oauth/access_token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: appId, client_secret: appSecret, code: input.code }),
      signal: AbortSignal.timeout(12000)
    });
    const tokenBody = await tokenResponse.json() as TokenResponse;
    if (!tokenResponse.ok || !tokenBody.access_token) throw new BadGatewayException("A Meta não concluiu a autorização");

    const phoneResponse = await fetch(
      `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(input.phoneNumberId)}?fields=id,display_phone_number,verified_name`,
      { headers: { authorization: `Bearer ${tokenBody.access_token}` }, signal: AbortSignal.timeout(12000) }
    );
    const phone = await phoneResponse.json() as PhoneResponse;
    if (!phoneResponse.ok || phone.id !== input.phoneNumberId || !phone.display_phone_number) {
      throw new BadGatewayException("Não foi possível validar o número autorizado");
    }

    const accountPhonesResponse = await fetch(
      `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(input.businessAccountId)}/phone_numbers?fields=id&limit=100`,
      { headers: { authorization: `Bearer ${tokenBody.access_token}` }, signal: AbortSignal.timeout(12000) }
    );
    const accountPhones = await accountPhonesResponse.json() as PhoneListResponse;
    if (!accountPhonesResponse.ok || !accountPhones.data?.some((candidate) => candidate.id === input.phoneNumberId)) {
      throw new BadGatewayException("O número não pertence à conta empresarial autorizada");
    }

    const subscriptionResponse = await fetch(
      `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(input.businessAccountId)}/subscribed_apps`,
      { method: "POST", headers: { authorization: `Bearer ${tokenBody.access_token}` }, signal: AbortSignal.timeout(12000) }
    );
    if (!subscriptionResponse.ok) throw new BadGatewayException("Não foi possível ativar os eventos do WhatsApp");

    const stored = await fetch(`${baseUrl}/rest/v1/rpc/complete_meta_whatsapp_connection`, {
      method: "POST",
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        p_org_id: session.organizationId,
        p_user_id: session.userId,
        p_phone_number_id: input.phoneNumberId,
        p_business_account_id: input.businessAccountId,
        p_phone_number: phone.display_phone_number,
        p_display_name: phone.verified_name ?? phone.display_phone_number,
        p_access_token: tokenBody.access_token
      }),
      signal: AbortSignal.timeout(12000)
    });
    if (!stored.ok) throw new ServiceUnavailableException("Não foi possível guardar a conexão com segurança");
    const connectionId = await stored.json() as string;
    return { status: "connected", connectionId, displayName: phone.verified_name, phoneNumber: phone.display_phone_number };
  }

  private async assertWhatsappNumberLimitNotReached(baseUrl: string, serviceKey: string, orgId: string): Promise<void> {
    const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };
    const billingResponse = await fetch(
      `${baseUrl}/rest/v1/organization_billing?org_id=eq.${encodeURIComponent(orgId)}&select=effective_whatsapp_numbers_limit&limit=1`,
      { headers, signal: AbortSignal.timeout(8000) }
    );
    if (!billingResponse.ok) return; // sem dado de billing, não bloqueia
    const billingRows = await billingResponse.json() as Array<{ effective_whatsapp_numbers_limit: number | null }>;
    const limit = billingRows[0]?.effective_whatsapp_numbers_limit;
    if (limit === null || limit === undefined) return;

    const countResponse = await fetch(
      `${baseUrl}/rest/v1/whatsapp_connections?org_id=eq.${encodeURIComponent(orgId)}&select=id`,
      { headers: { ...headers, Prefer: "count=exact" }, signal: AbortSignal.timeout(8000) }
    );
    if (!countResponse.ok) return;
    const contentRange = countResponse.headers.get("content-range");
    const currentCount = contentRange ? Number(contentRange.split("/")[1]) : 0;
    if (Number.isFinite(currentCount) && currentCount >= limit) {
      throw new BadRequestException("Limite de números de WhatsApp do seu plano atingido — adicione mais em Configurações › Planos e cobrança");
    }
  }
}
