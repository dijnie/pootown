import { Module } from "@nestjs/common";

import { GameSessionsController } from "./game-sessions.controller";
import { GameSessionsService } from "./game-sessions.service";
import { EconomyModule } from "../economy/economy.module";

@Module({
  imports: [EconomyModule],
  controllers: [GameSessionsController],
  providers: [GameSessionsService],
  exports: [GameSessionsService],
})
export class GameSessionsModule {}
