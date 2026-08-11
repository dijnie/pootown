import {
  ApiErrorEnvelopeSchema,
  CONTRACT_VERSION,
  type ApiErrorCode,
} from "@pootown/game-contracts";
import { z } from "zod";

const DEFAULT_TIMEOUT_MS = 10_000;

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: ApiErrorCode | "RESPONSE_INVALID" | "REQUEST_TIMEOUT";
  public readonly requestId?: string;

  public constructor(
    message: string,
    status: number,
    code: ApiError["code"],
    requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export type AccessTokenProvider = () => Promise<string | null>;

export type ApiClientOptions = {
  baseUrl: string;
  getAccessToken?: AccessTokenProvider;
  timeoutMs?: number;
  fetcher?: typeof fetch;
};

export type MutationOptions = {
  idempotencyKey: string;
};

type RequestOptions = {
  authenticated?: boolean;
  body?: unknown;
  idempotencyKey?: string;
  method: "DELETE" | "GET" | "POST";
  query?: Record<string, unknown>;
};

export function buildQuery(params: Record<string, unknown> = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    query.set(key, String(value));
  }
  const serialized = query.toString();
  return serialized.length === 0 ? "" : `?${serialized}`;
}

function normalizedBaseUrl(raw: string): string {
  if (/^\/[A-Za-z0-9/_-]*$/.test(raw) && !raw.includes("..")) {
    return raw.endsWith("/") ? raw.slice(0, -1) : raw;
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("API base URL must be an HTTP origin");
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username !== "" || parsed.password !== "" || parsed.search !== "" || parsed.hash !== "") {
    throw new Error("API base URL must be an HTTP URL without credentials, query, or fragment");
  }
  const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
  return `${parsed.origin}${pathname}`;
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function responseError(response: Response, body: unknown): ApiError {
  const parsed = ApiErrorEnvelopeSchema.safeParse(body);
  if (parsed.success) {
    return new ApiError(
      parsed.data.error.message,
      response.status,
      parsed.data.error.code,
      parsed.data.error.requestId,
    );
  }
  return new ApiError("Request failed", response.status, "RESPONSE_INVALID");
}

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new Error("API timeout must be between 1 and 60000 milliseconds");
  }

  async function accessToken(): Promise<string> {
    const token = await options.getAccessToken?.();
    if (token === undefined || token === null || token.length === 0) {
      throw new ApiError("Authentication required", 401, "AUTH_TOKEN_MISSING");
    }
    return token;
  }

  async function attempt(path: string, request: RequestOptions): Promise<{
    body: unknown;
    response: Response;
  }> {
    const controller = new AbortController();
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const headers: Record<string, string> = {
            accept: "application/json",
            "x-contract-version": String(CONTRACT_VERSION),
          };
          if (request.body !== undefined) headers["content-type"] = "application/json";
          if (request.idempotencyKey !== undefined) headers["idempotency-key"] = request.idempotencyKey;
          if (request.authenticated === true) headers.authorization = `Bearer ${await accessToken()}`;
          const response = await fetcher(`${baseUrl}${path}${buildQuery(request.query)}`, {
            body: request.body === undefined ? undefined : JSON.stringify(request.body),
            cache: "no-store",
            headers,
            method: request.method,
            signal: controller.signal,
          });
          return { response, body: await responseJson(response) };
        })(),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            timedOut = true;
            controller.abort();
            reject(new ApiError("Request timed out", 0, "REQUEST_TIMEOUT"));
          }, timeoutMs);
        }),
      ]);
    } catch (error) {
      if (timedOut) {
        throw new ApiError("Request timed out", 0, "REQUEST_TIMEOUT");
      }
      throw error;
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }

  async function request<TSchema extends z.ZodTypeAny>(
    path: string,
    schema: TSchema,
    requestOptions: RequestOptions,
  ): Promise<z.output<TSchema>> {
    let { response, body } = await attempt(path, requestOptions);
    if (!response.ok && requestOptions.authenticated === true && response.status === 401) {
      const firstError = responseError(response, body);
      if (firstError.code === "AUTH_TOKEN_EXPIRED" || firstError.code === "AUTH_TOKEN_INVALID") {
        ({ response, body } = await attempt(path, requestOptions));
      }
    }
    if (!response.ok) throw responseError(response, body);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError("API response is invalid", 502, "RESPONSE_INVALID");
    return parsed.data;
  }

  return {
    get<TSchema extends z.ZodTypeAny>(
      path: string,
      query: Record<string, unknown> | undefined,
      schema: TSchema,
      authenticated = false,
    ) {
      return request(path, schema, { authenticated, method: "GET", query });
    },
    post<TSchema extends z.ZodTypeAny>(
      path: string,
      body: unknown,
      schema: TSchema,
      mutation: MutationOptions,
    ) {
      return request(path, schema, {
        authenticated: true,
        body,
        idempotencyKey: mutation.idempotencyKey,
        method: "POST",
      });
    },
    delete<TSchema extends z.ZodTypeAny>(
      path: string,
      body: unknown,
      schema: TSchema,
      mutation: MutationOptions,
    ) {
      return request(path, schema, {
        authenticated: true,
        body,
        idempotencyKey: mutation.idempotencyKey,
        method: "DELETE",
      });
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
