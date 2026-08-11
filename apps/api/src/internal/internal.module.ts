import { Module } from "@nestjs/common";

import { InternalController } from "./internal.controller";
import { InternalSettlementService } from "./internal-settlement.service";
import { InternalSessionService } from "./internal-session.service";
import { ReconciliationService } from "./reconciliation.service";
import { GameSessionsModule } from "../game-sessions/game-sessions.module";

@Module({
  imports: [GameSessionsModule],
  controllers: [InternalController],
  providers: [InternalSessionService, InternalSettlementService, ReconciliationService],
  exports: [InternalSessionService, InternalSettlementService, ReconciliationService],
})
export class InternalModule {}
