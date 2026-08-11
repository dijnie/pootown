import { Module } from "@nestjs/common";

import { EconomyService } from "./economy.service";
import { AccountController } from "./account.controller";
import { IdentityModule } from "../identity/identity.module";

@Module({
  imports: [IdentityModule],
  controllers: [AccountController],
  providers: [EconomyService],
  exports: [EconomyService],
})
export class EconomyModule {}
