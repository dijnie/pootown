import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";

import { DATABASE_POOL } from "./database.constants";

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Pool =>
        new Pool({
          connectionString: config.getOrThrow<string>("DATABASE_URL"),
          max: 20,
          statement_timeout: 10_000,
          application_name: "pootown-api",
        }),
    },
  ],
  exports: [DATABASE_POOL],
})
export class DatabaseModule {}
