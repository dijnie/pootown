import "reflect-metadata";

import fastifyHelmet from "@fastify/helmet";
import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module";
import { corsOrigins, parseApiEnvironment } from "./config/api-config";
import { ApiExceptionFilter } from "./platform/http/api-exception.filter";

async function bootstrap(): Promise<void> {
  const environment = parseApiEnvironment(process.env);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 64 * 1024, trustProxy: false, genReqId: () => randomUUID() }),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.register(fastifyHelmet);
  const allowedOrigins = corsOrigins(environment);
  app.enableCors({
    credentials: true,
    origin: (origin, callback) => {
      if (origin === undefined || allowedOrigins.has(origin)) callback(null, true);
      else callback(new Error("Origin is not allowed"), false);
    },
  });
  await app.listen({ host: environment.API_HOST, port: environment.API_PORT });
}

void bootstrap();
