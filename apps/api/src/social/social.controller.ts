import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentSession } from "../auth/current-session.decorator";
import { KavroAuthGuard } from "../auth/kavro-auth.guard";
import type { KavroSession } from "../auth/session";
import { SocialOnboardingService } from "./social-onboarding.service";

@Controller("social")
@UseGuards(KavroAuthGuard)
export class SocialController {
  constructor(private readonly onboarding: SocialOnboardingService) {}

  @Get("readiness")
  readiness(@CurrentSession() session: KavroSession) {
    return {
      organizationId: session.organizationId,
      canManage: session.role === "owner" || session.role === "admin",
      ...this.onboarding.readiness()
    };
  }

  @Post("connect/list-pages")
  listPages(@CurrentSession() session: KavroSession, @Body() body: { code: string; redirectUri: string }) {
    return this.onboarding.listPages(session, body);
  }

  @Post("connect/complete")
  completeConnection(
    @CurrentSession() session: KavroSession,
    @Body() body: { selectionToken: string; brandId: string; pageId: string; provider: "instagram" | "facebook" }
  ) {
    return this.onboarding.completeConnection(session, body);
  }
}
