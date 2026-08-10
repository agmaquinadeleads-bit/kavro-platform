import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentSession } from "../auth/current-session.decorator";
import { KavroAuthGuard } from "../auth/kavro-auth.guard";
import type { KavroSession } from "../auth/session";
import { EvolutionClient } from "./evolution.client";

@Controller("whatsapp")
@UseGuards(KavroAuthGuard)
export class WhatsappController {
  constructor(private readonly evolution: EvolutionClient) {}

  @Get("readiness")
  readiness(@CurrentSession() session: KavroSession) {
    return { configured: this.evolution.isConfigured(), organizationId: session.organizationId, canManage: session.role === "owner" || session.role === "admin" };
  }
}
