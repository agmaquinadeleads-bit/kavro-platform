import { BadGatewayException, BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { KavroSession } from "../auth/session";

type CompleteInput = { code: string; phoneNumberId: string; businessAccountId: string };
type TokenResponse = { access_token?: string };
type PhoneResponse = { id?: string; display_phone_number?: string; verified_name?: string; error?: unknown };
type PhoneListResponse = { data?: Array<{ id?: string }> };

@Injectable()
export class MetaOnboardingService {
  async complete(session: KavroSession, input: CompleteInput) {
    if (session.role === "member") throw new BadRequestException("Somente administradores podem conectar números");
    if (!input.code || !/^\d{3,30}$/.test(input.phoneNumberId) || !/^\d{3,30}$/.test(input.businessAccountId)) {
      throw new BadRequestException("Retorno inválido do cadastro da Meta");
    }

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const graphVersion = process.env.META_GRAPH_API_VERSION ?? "v23.0";
    if (!appId || !appSecret) throw new ServiceUnavailableException("Cadastro da Meta não configurado");

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

    const baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!baseUrl || !serviceKey) throw new ServiceUnavailableException("Cofre de credenciais não configurado");
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
}
