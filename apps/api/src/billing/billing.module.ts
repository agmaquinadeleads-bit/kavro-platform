import { Module } from "@nestjs/common";
import { StripeClient } from "./stripe.client";
import { StripeWebhookController } from "./stripe-webhook.controller";
import { StripeWebhookService } from "./stripe-webhook.service";

@Module({
  controllers: [StripeWebhookController],
  providers: [StripeClient, StripeWebhookService]
})
export class BillingModule {}
