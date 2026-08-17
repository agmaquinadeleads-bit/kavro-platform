import { Module } from "@nestjs/common";
import { KavroAuthGuard } from "../auth/kavro-auth.guard";
import { EvolutionClient } from "./evolution.client";
import { EvolutionConnectionService } from "./evolution-connection.service";
import { EvolutionWebhookController } from "./evolution-webhook.controller";
import { EvolutionWebhookService } from "./evolution-webhook.service";
import { MetaWhatsappClient } from "./meta-whatsapp.client";
import { WhatsappController } from "./whatsapp.controller";
import { MetaWebhookController } from "./meta-webhook.controller";
import { MetaWebhookService } from "./meta-webhook.service";
import { MetaOnboardingService } from "./meta-onboarding.service";
import { WhatsappInboundWorkerService } from "./whatsapp-inbound-worker.service";
import { WhatsappOutboxWorkerService } from "./whatsapp-outbox-worker.service";
import { WhatsappSendService } from "./whatsapp-send.service";

@Module({
  controllers: [WhatsappController, MetaWebhookController, EvolutionWebhookController],
  providers: [
    EvolutionClient,
    KavroAuthGuard,
    MetaWebhookService,
    MetaOnboardingService,
    EvolutionConnectionService,
    EvolutionWebhookService,
    WhatsappInboundWorkerService,
    MetaWhatsappClient,
    WhatsappSendService,
    WhatsappOutboxWorkerService
  ],
  exports: [EvolutionClient]
})
export class WhatsappModule {}
