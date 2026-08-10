import { Controller, Get, Headers, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { MetaWebhookService } from "./meta-webhook.service";

type RawBodyRequest = FastifyRequest & { rawBody?: Buffer };

@Controller("webhooks/meta/whatsapp")
export class MetaWebhookController {
  constructor(private readonly webhook: MetaWebhookService) {}

  @Get()
  verify(
    @Query("hub.mode") mode: string | undefined,
    @Query("hub.verify_token") verifyToken: string | undefined,
    @Query("hub.challenge") challenge: string | undefined
  ) {
    return this.webhook.verifyChallenge(mode, verifyToken, challenge);
  }

  @Post()
  receive(@Req() request: RawBodyRequest, @Headers("x-hub-signature-256") signature?: string) {
    const rawBody = request.rawBody;
    if (!rawBody) throw new Error("Raw request body unavailable");
    this.webhook.validateSignature(rawBody, signature);
    return this.webhook.capture(request.body as Record<string, unknown>);
  }
}
