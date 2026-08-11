import { Module } from "@nestjs/common";

import { InternalController } from "./internal.controller";
import { InternalSettlementService } from "./internal-settlement.service";
import { InternalSessionService } from "./internal-session.service";

@Module({
  controllers: [InternalController],
  providers: [InternalSessionService, InternalSettlementService],
  exports: [InternalSessionService, InternalSettlementService],
})
export class InternalModule {}
