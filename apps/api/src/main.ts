import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./modules/app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
    { rawBody: true }
  );

  app.enableShutdownHooks();
  const allowedOrigins = (process.env.KAVRO_WEB_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: allowedOrigins, methods: ["GET", "POST", "OPTIONS"], allowedHeaders: ["authorization", "content-type"] });
  app.setGlobalPrefix("v1");
  await app.listen(Number(process.env.PORT ?? 3001), "0.0.0.0");
}

void bootstrap();
