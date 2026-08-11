import {
  CONTRACT_VERSION,
  MutationHeadersSchema,
  type MutationHeaders,
} from "@pootown/game-contracts";

import { ApiHttpException } from "./api-http.exception";

export type HttpHeaders = Readonly<Record<string, string | readonly string[] | undefined>>;

function singleHeader(headers: HttpHeaders, name: string): string | undefined {
  const value = headers[name];
  return typeof value === "string" ? value : undefined;
}

export function requireContractVersion(headers: HttpHeaders): typeof CONTRACT_VERSION {
  if (singleHeader(headers, "x-contract-version") !== String(CONTRACT_VERSION)) {
    throw new ApiHttpException("CONTRACT_VERSION_UNSUPPORTED", 400, "Contract version is unsupported");
  }
  return CONTRACT_VERSION;
}

export function requireMutationHeaders(headers: HttpHeaders): MutationHeaders {
  const contractVersion = requireContractVersion(headers);
  const idempotencyKey = singleHeader(headers, "idempotency-key");
  if (idempotencyKey === undefined) {
    throw new ApiHttpException("IDEMPOTENCY_KEY_REQUIRED", 400, "Idempotency key is required");
  }
  const parsed = MutationHeadersSchema.safeParse({ contractVersion, idempotencyKey });
  if (!parsed.success) {
    throw new ApiHttpException("REQUEST_INVALID", 400, "Mutation headers are invalid");
  }
  return parsed.data;
}
