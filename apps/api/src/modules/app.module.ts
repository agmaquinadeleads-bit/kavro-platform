import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { HealthController } from "./health.controller";
import { WhatsappModule } from "../whatsapp/whatsapp.module";
import { SocialModule } from "../social/social.module";
import { BillingModule } from "../billing/billing.module";

@Module({
  imports: [ScheduleModule.forRoot(), WhatsappModule, SocialModule, BillingModule],
  controllers: [HealthController]
})
export class AppModule {}
