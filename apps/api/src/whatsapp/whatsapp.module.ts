import { Module } from "@nestjs/common";
import { KavroAuthGuard } from "../auth/kavro-auth.guard";
import { EvolutionClient } from "./evolution.client";
import { WhatsappController } from "./whatsapp.controller";
import { MetaWebhookController } from "./meta-webhook.controller";
import { MetaWebhookService } from "./meta-webhook.service";
import { MetaOnboardingService } from "./meta-onboarding.service";

@Module({ controllers: [WhatsappController, MetaWebhookController], providers: [EvolutionClient, KavroAuthGuard, MetaWebhookService, MetaOnboardingService], exports: [EvolutionClient] })
export class WhatsappModule {}
