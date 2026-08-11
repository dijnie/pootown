import {
  ApiErrorEnvelopeSchema,
  CONTRACT_VERSION,
  GameIdSchema,
  IdempotencyKeySchema,
} from "@pootown/game-contracts";
import {
  SessionBootstrapResponseSchema,
  TicketConsumeRequestSchema,
  TicketConsumeResponseSchema,
  type SessionBootstrapResponse,
  type TicketConsumeResponse,
} from "@pootown/game-contracts/internal";
import type { z } from "zod";

import type { ServiceCredentialProvider } from "../auth/service-credential.js";

export class InternalApiRequestError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "InternalApiRequestError";
  }
}

export interface InternalApiClientOptions {
  readonly baseUrl: string;
  readonly credentialProvider: ServiceCredentialProvider;
  readonly fetchImplementation?: typeof fetch;
  readonly timeoutMs?: number;
}

export class InternalApiClient {
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;

  public constructor(private readonly options: InternalApiClientOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 5_000;
  }

  public bootstrap(gameIdValue: string): Promise<SessionBootstrapResponse> {
    const gameId = GameIdSchema.parse(gameIdValue);
    return this.request(
      `/internal/v1/game-sessions/${encodeURIComponent(gameId)}/bootstrap`,
      { method: "GET" },
      SessionBootstrapResponseSchema,
    );
  }

  public consumeTicket(
    requestValue: z.input<typeof TicketConsumeRequestSchema>,
    idempotencyKeyValue: string,
  ): Promise<TicketConsumeResponse> {
    const request = TicketConsumeRequestSchema.parse(requestValue);
    const idempotencyKey = IdempotencyKeySchema.parse(idempotencyKeyValue);
    return this.request(
      "/internal/v1/tickets/consume",
      {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify(request),
      },
      TicketConsumeResponseSchema,
    );
  }

  private async request<T>(path: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
    const credential = await this.options.credentialProvider.issue();
    let response: Response;
    try {
      response = await this.fetchImplementation(`${this.options.baseUrl}${path}`, {
        ...init,
        headers: {
          ...init.headers,
          authorization: `Bearer ${credential}`,
          "x-contract-version": String(CONTRACT_VERSION),
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new InternalApiRequestError(503, "INTERNAL_API_UNAVAILABLE", "Internal API is unavailable");
    }
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const envelope = ApiErrorEnvelopeSchema.safeParse(body);
      throw new InternalApiRequestError(
        response.status,
        envelope.success ? envelope.data.error.code : "INTERNAL_API_INVALID_ERROR",
        envelope.success ? envelope.data.error.message : "Internal API returned an invalid error",
      );
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new InternalApiRequestError(502, "INTERNAL_API_INVALID_RESPONSE", "Internal API returned an invalid response");
    }
    return parsed.data;
  }
}
