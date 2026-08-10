import { Module } from "@nestjs/common";
import { KavroAuthGuard } from "../auth/kavro-auth.guard";
import { EvolutionClient } from "./evolution.client";
import { WhatsappController } from "./whatsapp.controller";
import { MetaWebhookController } from "./meta-webhook.controller";
import { MetaWebhookService } from "./meta-webhook.service";

@Module({ controllers: [WhatsappController, MetaWebhookController], providers: [EvolutionClient, KavroAuthGuard, MetaWebhookService], exports: [EvolutionClient] })
export class WhatsappModule {}
