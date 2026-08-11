import { Module } from "@nestjs/common";

import { LeaderboardController, SessionHistoryController } from "./read-models.controller";
import { ReadModelsService } from "./read-models.service";
import { EconomyModule } from "../economy/economy.module";

@Module({
  imports: [EconomyModule],
  controllers: [LeaderboardController, SessionHistoryController],
  providers: [ReadModelsService],
  exports: [ReadModelsService],
})
export class ReadModelsModule {}
