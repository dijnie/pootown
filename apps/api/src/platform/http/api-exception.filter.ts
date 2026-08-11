import { ArgumentsHost, Catch, HttpException, HttpStatus, type ExceptionFilter } from "@nestjs/common";
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
    response.status(status).send({
      error: {
        code,
        message,
        requestId: request.id ?? randomUUID(),
      },
    });
  }
}
