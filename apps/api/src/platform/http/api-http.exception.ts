import { HttpException } from "@nestjs/common";
import type { ApiErrorCode } from "@pootown/game-contracts";

export class ApiHttpException extends HttpException {
  public constructor(
    public readonly code: ApiErrorCode,
    status: number,
    public readonly safeMessage: string,
  ) {
    super(safeMessage, status);
  }
}
