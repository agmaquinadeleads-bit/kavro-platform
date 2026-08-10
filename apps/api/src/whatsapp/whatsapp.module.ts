import { Module } from "@nestjs/common";
import { KavroAuthGuard } from "../auth/kavro-auth.guard";
import { EvolutionClient } from "./evolution.client";
import { WhatsappController } from "./whatsapp.controller";

@Module({ controllers: [WhatsappController], providers: [EvolutionClient, KavroAuthGuard], exports: [EvolutionClient] })
export class WhatsappModule {}
