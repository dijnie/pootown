import { Module } from "@nestjs/common";

import { InternalController } from "./internal.controller";
import { InternalSessionService } from "./internal-session.service";

@Module({
  controllers: [InternalController],
  providers: [InternalSessionService],
  exports: [InternalSessionService],
})
export class InternalModule {}
