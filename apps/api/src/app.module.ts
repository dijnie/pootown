import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { ScheduleModule } from "@nestjs/schedule";

import { AuthModule } from "./auth/auth.module";
import { InternalAuthGuard } from "./auth/internal-auth.guard";
import { UserAuthGuard } from "./auth/user-auth.guard";
import { parseApiEnvironment } from "./config/api-config";
import { DatabaseModule } from "./database/database.module";
import { EconomyModule } from "./economy/economy.module";
import { GameSessionsModule } from "./game-sessions/game-sessions.module";
import { HealthModule } from "./health/health.module";
import { InternalModule } from "./internal/internal.module";
import { loggerConfig } from "./observability/logger.config";
import { ReadModelsModule } from "./read-models/read-models.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: parseApiEnvironment }),
    LoggerModule.forRoot(loggerConfig),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AuthModule,
    DatabaseModule,
    EconomyModule,
    GameSessionsModule,
    InternalModule,
    ReadModelsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: UserAuthGuard },
    { provide: APP_GUARD, useClass: InternalAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
