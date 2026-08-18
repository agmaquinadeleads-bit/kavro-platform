import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentSession } from "../auth/current-session.decorator";
import { KavroAuthGuard } from "../auth/kavro-auth.guard";
import type { KavroSession } from "../auth/session";
import { EvolutionClient } from "./evolution.client";
import { EvolutionConnectionService } from "./evolution-connection.service";
import { MetaOnboardingService } from "./meta-onboarding.service";
import { WhatsappSendService } from "./whatsapp-send.service";

@Controller("whatsapp")
@UseGuards(KavroAuthGuard)
export class WhatsappController {
  constructor(
    private readonly evolution: EvolutionClient,
    private readonly metaOnboarding: MetaOnboardingService,
    private readonly evolutionConnection: EvolutionConnectionService,
    private readonly whatsappSend: WhatsappSendService
  ) {}

  @Get("readiness")
  readiness(@CurrentSession() session: KavroSession) {
    return {
      configured: this.evolution.isConfigured(),
      organizationId: session.organizationId,
      canManage: session.role === "owner" || session.role === "admin",
      official: this.metaOnboarding.readiness()
    };
  }

  @Post("meta/onboarding")
  completeMetaOnboarding(@CurrentSession() session: KavroSession, @Body() body: { code: string; phoneNumberId: string; businessAccountId: string }) {
    return this.metaOnboarding.complete(session, body);
  }

  @Post("evolution/connections")
  createEvolutionConnection(@CurrentSession() session: KavroSession, @Body() body: { displayName?: string }) {
    return this.evolutionConnection.createConnection(session, body.displayName ?? "");
  }

  @Get("evolution/connections/:id/status")
  getEvolutionConnectionStatus(@CurrentSession() session: KavroSession, @Param("id") id: string) {
    return this.evolutionConnection.getStatus(session, id);
  }

  @Post("evolution/connections/:id/qr")
  regenerateEvolutionQr(@CurrentSession() session: KavroSession, @Param("id") id: string) {
    return this.evolutionConnection.regenerateQr(session, id);
  }

  @Patch("connections/:id")
  renameConnection(@CurrentSession() session: KavroSession, @Param("id") id: string, @Body() body: { displayName?: string }) {
    return this.evolutionConnection.renameConnection(session, id, body.displayName ?? "");
  }

  @Delete("connections/:id")
  deleteConnection(@CurrentSession() session: KavroSession, @Param("id") id: string) {
    return this.evolutionConnection.deleteConnection(session, id);
  }

  @Post("messages")
  sendMessage(@CurrentSession() session: KavroSession, @Body() body: { connectionId?: string; conversationId?: string; text?: string }) {
    return this.whatsappSend.send(session, {
      connectionId: body.connectionId ?? "",
      conversationId: body.conversationId ?? "",
      text: body.text ?? ""
    });
  }
}
