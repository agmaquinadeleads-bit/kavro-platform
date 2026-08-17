import { Body, Controller, Headers, Param, Post } from "@nestjs/common";
import { EvolutionWebhookService } from "./evolution-webhook.service";

// Rota pública (sem KavroAuthGuard) — a Evolution não tem sessão de
// usuário Kavro, só o segredo por instância verificado dentro do service.
// Mesmo formato de meta-webhook.controller.ts, trocando a verificação
// HMAC (global, app da Meta) por um segredo por conexão.
@Controller("webhooks/evolution/whatsapp")
export class EvolutionWebhookController {
  constructor(private readonly webhook: EvolutionWebhookService) {}

  @Post(":instanceName")
  receive(
    @Param("instanceName") instanceName: string,
    @Body() body: Record<string, unknown>,
    @Headers("x-kavro-webhook-secret") secret?: string
  ) {
    return this.webhook.capture(instanceName, body, secret);
  }
}
