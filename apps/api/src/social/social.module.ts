import { Module } from "@nestjs/common";
import { KavroAuthGuard } from "../auth/kavro-auth.guard";
import { ContentPublishWorkerService } from "./content-publish-worker.service";
import { MetaGraphClient } from "./meta-graph.client";
import { SocialController } from "./social.controller";
import { SocialOnboardingService } from "./social-onboarding.service";

@Module({
  controllers: [SocialController],
  providers: [MetaGraphClient, KavroAuthGuard, SocialOnboardingService, ContentPublishWorkerService]
})
export class SocialModule {}
