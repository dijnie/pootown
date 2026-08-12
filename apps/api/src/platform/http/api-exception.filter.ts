import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger, type ExceptionFilter } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { ApiHttpException } from "./api-http.exception";

interface ErrorRequest {
  readonly id?: string;
}

interface ErrorResponse {
  status(code: number): ErrorResponse;
  send(body: unknown): void;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  public catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<ErrorRequest>();
    const response = context.getResponse<ErrorResponse>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const code =
      exception instanceof ApiHttpException
        ? exception.code
        : status === HttpStatus.BAD_REQUEST
          ? "REQUEST_INVALID"
          : "INTERNAL_ERROR";
    const message = exception instanceof ApiHttpException ? exception.safeMessage : "Request failed";
    if (!(exception instanceof HttpException)) {
      const error = typeof exception === "object" && exception !== null
        ? exception as { readonly code?: unknown; readonly constraint?: unknown; readonly name?: unknown }
        : {};
      this.logger.error({
        kind: "unhandled-api-exception",
        requestId: request.id,
        errorType: typeof error.name === "string" && error.name.length <= 64 ? error.name : "unknown",
        databaseCode: typeof error.code === "string" && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : undefined,
        constraint: typeof error.constraint === "string" && /^[a-z0-9_]{1,128}$/.test(error.constraint)
          ? error.constraint
          : undefined,
      });
    }
    response.status(status).send({
      error: {
        code,
        message,
        requestId: request.id ?? randomUUID(),
      },
    });
  }
}
