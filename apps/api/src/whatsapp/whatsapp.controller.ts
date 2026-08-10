import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentSession } from "../auth/current-session.decorator";
import { KavroAuthGuard } from "../auth/kavro-auth.guard";
import type { KavroSession } from "../auth/session";
import { EvolutionClient } from "./evolution.client";
import { MetaOnboardingService } from "./meta-onboarding.service";

@Controller("whatsapp")
@UseGuards(KavroAuthGuard)
export class WhatsappController {
  constructor(private readonly evolution: EvolutionClient, private readonly metaOnboarding: MetaOnboardingService) {}

  @Get("readiness")
  readiness(@CurrentSession() session: KavroSession) {
    return { configured: this.evolution.isConfigured(), organizationId: session.organizationId, canManage: session.role === "owner" || session.role === "admin" };
  }

  @Post("meta/onboarding")
  completeMetaOnboarding(@CurrentSession() session: KavroSession, @Body() body: { code: string; phoneNumberId: string; businessAccountId: string }) {
    return this.metaOnboarding.complete(session, body);
  }
}
