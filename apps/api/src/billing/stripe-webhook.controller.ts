import { Controller, Headers, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { StripeWebhookService } from "./stripe-webhook.service";

type RawBodyRequest = FastifyRequest & { rawBody?: Buffer };

// Mesmo padrão de meta-webhook.controller.ts: rota pública (sem
// KavroAuthGuard — é o Stripe quem chama, autenticado por assinatura, não
// por sessão de usuário), raw body já disponível globalmente (main.ts,
// rawBody: true).
@Controller("webhooks/stripe")
export class StripeWebhookController {
  constructor(private readonly webhook: StripeWebhookService) {}

  @Post()
  receive(@Req() request: RawBodyRequest, @Headers("stripe-signature") signature?: string) {
    const rawBody = request.rawBody;
    if (!rawBody) throw new Error("Raw request body unavailable");
    return this.webhook.handle(rawBody, signature);
  }
}
