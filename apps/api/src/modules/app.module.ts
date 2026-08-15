import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { HealthController } from "./health.controller";
import { WhatsappModule } from "../whatsapp/whatsapp.module";
import { SocialModule } from "../social/social.module";

@Module({
  imports: [ScheduleModule.forRoot(), WhatsappModule, SocialModule],
  controllers: [HealthController]
})
export class AppModule {}
