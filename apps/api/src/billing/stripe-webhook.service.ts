import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type Stripe from "stripe";
import { StripeClient } from "./stripe.client";

type CatalogRow = { stripe_price_id: string; kind: string };
type BillingRow = { org_id: string; stripe_customer_id: string | null; stripe_subscription_id: string | null };

// Processa evento de assinatura do Stripe de forma síncrona, na própria
// request (diferente do worker de WhatsApp, que drena via cron) — volume
// de evento de assinatura é baixo (não é chat em tempo real), e a
// verificação de assinatura já garante que só o Stripe consegue chegar
// até aqui, então não há motivo pra enfileirar.
@Injectable()
export class StripeWebhookService {
  private readonly logger = new Logger(StripeWebhookService.name);

  constructor(private readonly stripeClient: StripeClient) {}

  private baseUrl() {
    return process.env.SUPABASE_URL!.replace(/\/$/, "");
  }

  private serviceHeaders() {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
  }

  private async selectOne<T>(table: string, query: string): Promise<T | null> {
    const response = await fetch(`${this.baseUrl()}/rest/v1/${table}?${query}&limit=1`, {
      headers: this.serviceHeaders(),
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new ServiceUnavailableException(`Consulta a ${table} falhou (${response.status})`);
    const rows = await response.json() as T[];
    return rows[0] ?? null;
  }

  private async select<T>(table: string, query: string): Promise<T[]> {
    const response = await fetch(`${this.baseUrl()}/rest/v1/${table}?${query}`, {
      headers: this.serviceHeaders(),
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new ServiceUnavailableException(`Consulta a ${table} falhou (${response.status})`);
    return await response.json() as T[];
  }

  private async insert<T>(table: string, body: Record<string, unknown>): Promise<{ conflict: boolean; row: T | null }> {
    const response = await fetch(`${this.baseUrl()}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...this.serviceHeaders(), Prefer: "return=representation" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000)
    });
    if (response.status === 409) return { conflict: true, row: null };
    if (!response.ok) throw new ServiceUnavailableException(`Inserção em ${table} falhou (${response.status}): ${await response.text()}`);
    const rows = await response.json() as T[];
    return { conflict: false, row: rows[0] ?? null };
  }

  private async upsert(table: string, onConflict: string, body: Record<string, unknown>): Promise<void> {
    const response = await fetch(`${this.baseUrl()}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: "POST",
      headers: { ...this.serviceHeaders(), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new ServiceUnavailableException(`Upsert em ${table} falhou (${response.status}): ${await response.text()}`);
  }

  private async patch(table: string, query: string, body: Record<string, unknown>): Promise<void> {
    const response = await fetch(`${this.baseUrl()}/rest/v1/${table}?${query}`, {
      method: "PATCH",
      headers: this.serviceHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new ServiceUnavailableException(`Atualização em ${table} falhou (${response.status}): ${await response.text()}`);
  }

  private async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl()}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: this.serviceHeaders(),
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new ServiceUnavailableException(`RPC ${name} falhou (${response.status}): ${await response.text()}`);
    return await response.json() as T;
  }

  async handle(rawBody: Buffer, signature: string | undefined) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) throw new ServiceUnavailableException("Webhook do Stripe não configurado");
    if (!signature) throw new UnauthorizedException("Assinatura do Stripe ausente");

    let event: Stripe.Event;
    try {
      event = this.stripeClient.sdk.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error) {
      throw new UnauthorizedException(`Assinatura do Stripe inválida: ${(error as Error).message}`);
    }

    // Idempotência — Stripe reenvia evento em caso de timeout/5xx. Conflito
    // de stripe_event_id = já processado antes, responde 200 sem repetir.
    const inserted = await this.insert("stripe_webhook_events", {
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>
    });
    if (inserted.conflict) return { received: true, duplicate: true };

    try {
      await this.processEvent(event);
      await this.patch("stripe_webhook_events", `stripe_event_id=eq.${event.id}`, { processing_status: "processed", processed_at: new Date().toISOString() });
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(`Falha ao processar evento Stripe ${event.id} (${event.type}): ${message}`);
      await this.patch("stripe_webhook_events", `stripe_event_id=eq.${event.id}`, { processing_status: "failed", error_code: message.slice(0, 120) });
    }

    return { received: true };
  }

  private async processEvent(event: Stripe.Event) {
    switch (event.type) {
      case "checkout.session.completed":
        return this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      case "customer.subscription.updated":
      case "customer.subscription.created":
        return this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      case "customer.subscription.deleted":
        return this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      case "invoice.payment_failed":
        return this.handlePaymentFailed(event.data.object as Stripe.Invoice);
      default:
        this.logger.debug(`Evento Stripe ignorado (sem handler): ${event.type}`);
    }
  }

  // client_reference_id (ou metadata.org_id) é como o Kavro amarra a
  // sessão de checkout à organização — precisa ser setado na criação da
  // Checkout Session (Fase C). Sem isso, não tem como saber de qual org é
  // esse cliente novo — fica só registrado o evento bruto (audit trail),
  // sem vínculo, pra reconciliação manual depois.
  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const orgId = session.client_reference_id ?? (typeof session.metadata?.org_id === "string" ? session.metadata.org_id : null);
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    if (!orgId || !customerId) {
      this.logger.warn(`checkout.session.completed sem org_id/customer resolvível (session=${session.id}) — precisa de reconciliação manual`);
      return;
    }

    await this.upsert("organization_billing", "org_id", {
      org_id: orgId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId ?? null,
      subscription_status: "active"
    });
    // Os itens da assinatura (plano base + add-ons) chegam pelo evento
    // customer.subscription.updated que o Stripe dispara logo em seguida —
    // não duplica essa lógica aqui.
  }

  private async findOrgIdByCustomerId(customerId: string): Promise<string | null> {
    const row = await this.selectOne<BillingRow>("organization_billing", `stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=org_id,stripe_customer_id,stripe_subscription_id`);
    return row?.org_id ?? null;
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const orgId = await this.findOrgIdByCustomerId(customerId);
    if (!orgId) {
      this.logger.warn(`customer.subscription.updated sem organização vinculada ao customer=${customerId} (subscription=${subscription.id}) — ignorado até reconciliação manual`);
      return;
    }

    const priceIds = subscription.items.data.map((item) => item.price.id);
    const catalogRows = priceIds.length ? await this.select<CatalogRow>("billing_plan_catalog", `stripe_price_id=in.(${priceIds.map((id) => `"${id}"`).join(",")})&select=stripe_price_id,kind`) : [];
    const catalogByPriceId = new Map(catalogRows.map((row) => [row.stripe_price_id, row.kind]));

    let basePlanPriceId: string | null = null;
    for (const item of subscription.items.data) {
      const kind = catalogByPriceId.get(item.price.id);
      if (kind === "base_plan") {
        basePlanPriceId = item.price.id;
      } else if (kind?.startsWith("addon_")) {
        await this.upsert("organization_billing_addons", "org_id,stripe_price_id", {
          org_id: orgId,
          stripe_price_id: item.price.id,
          stripe_subscription_item_id: item.id,
          quantity: item.quantity ?? 0
        });
      } else if (kind === undefined) {
        this.logger.warn(`Item de assinatura com price_id desconhecido no catálogo: ${item.price.id} (subscription=${subscription.id}) — ignorado`);
      }
    }

    const currentPeriodEnd = subscription.items.data[0]?.current_period_end;
    await this.patch("organization_billing", `org_id=eq.${orgId}`, {
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status,
      current_period_end: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
      ...(basePlanPriceId ? { base_plan_price_id: basePlanPriceId } : {})
    });

    await this.rpc("refresh_organization_billing_limits", { p_org_id: orgId });
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const orgId = await this.findOrgIdByCustomerId(customerId);
    if (!orgId) return;
    await this.patch("organization_billing", `org_id=eq.${orgId}`, { subscription_status: "canceled" });
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice) {
    const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
    if (!customerId) return;
    const orgId = await this.findOrgIdByCustomerId(customerId);
    if (!orgId) return;
    await this.patch("organization_billing", `org_id=eq.${orgId}`, { subscription_status: "past_due" });
  }
}
