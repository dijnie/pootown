import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";

import { AuthModule } from "./auth/auth.module";
import { PrivyAuthGuard } from "./auth/privy-auth.guard";
import { parseApiEnvironment } from "./config/api-config";
import { DatabaseModule } from "./database/database.module";
import { EconomyModule } from "./economy/economy.module";
import { HealthModule } from "./health/health.module";
import { loggerConfig } from "./observability/logger.config";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: parseApiEnvironment }),
    LoggerModule.forRoot(loggerConfig),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AuthModule,
    DatabaseModule,
    EconomyModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: PrivyAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
