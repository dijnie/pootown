import {
  ApiErrorEnvelopeSchema,
  AuthSessionResponseSchema,
  CONTRACT_VERSION,
  LogoutResponseSchema,
  type AuthSessionResponse,
  type LogoutResponse,
} from "@pootown/game-contracts";

import { ApiError } from "./api-client";
import { normalizeApiOrigin } from "./api-origin";

type Credentials = { readonly email: string; readonly password: string };

export function createAuthApi(rawBaseUrl: string, fetcher: typeof fetch = fetch) {
  const baseUrl = normalizeApiOrigin(rawBaseUrl);

  async function post(path: string, body: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    let responseBody: unknown = null;
    try {
      response = await fetcher(`${baseUrl}${path}`, {
        body: JSON.stringify(body),
        cache: "no-store",
        credentials: "include",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-contract-version": String(CONTRACT_VERSION),
        },
        method: "POST",
        signal: controller.signal,
      });
      try {
        responseBody = await response.json();
      } catch (error) {
        if (controller.signal.aborted) throw error;
        responseBody = null;
      }
    } catch (error) {
      if (controller.signal.aborted) throw new ApiError("Request timed out", 0, "REQUEST_TIMEOUT");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      const error = ApiErrorEnvelopeSchema.safeParse(responseBody);
      if (error.success) {
        throw new ApiError(
          error.data.error.message,
          response.status,
          error.data.error.code,
          error.data.error.requestId,
        );
      }
      throw new ApiError("Authentication request failed", response.status, "RESPONSE_INVALID");
    }
    return responseBody;
  }

  function session(path: string, credentials?: Credentials): Promise<AuthSessionResponse> {
    return post(path, { contractVersion: CONTRACT_VERSION, ...credentials }).then((body) => {
      const result = AuthSessionResponseSchema.safeParse(body);
      if (!result.success) throw new ApiError("Authentication response is invalid", 502, "RESPONSE_INVALID");
      return result.data;
    });
  }

  return {
    register(credentials: Credentials) {
      return session("/v1/auth/register", credentials);
    },
    login(credentials: Credentials) {
      return session("/v1/auth/login", credentials);
    },
    refresh() {
      return session("/v1/auth/refresh");
    },
    logout(): Promise<LogoutResponse> {
      return post("/v1/auth/logout", { contractVersion: CONTRACT_VERSION }).then((body) => {
        const result = LogoutResponseSchema.safeParse(body);
        if (!result.success) throw new ApiError("Logout response is invalid", 502, "RESPONSE_INVALID");
        return result.data;
      });
    },
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
