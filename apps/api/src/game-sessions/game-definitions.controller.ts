import { Controller, Get, Headers } from "@nestjs/common";
import type { GameDefinitionsResponse } from "@pootown/game-contracts";

import { GameSessionsService } from "./game-sessions.service";
import { Public } from "../auth/public.decorator";
import { requireContractVersion, type HttpHeaders } from "../platform/http/contract-headers";

@Controller("v1/game-definitions")
export class GameDefinitionsController {
  public constructor(private readonly sessions: GameSessionsService) {}

  @Public()
  @Get()
  public list(@Headers() headers: HttpHeaders): Promise<GameDefinitionsResponse> {
    requireContractVersion(headers);
    return this.sessions.listDefinitions();
  }
}
