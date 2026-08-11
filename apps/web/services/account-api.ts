import {
  CoinBalanceResponseSchema,
  CoinOperationsResponseSchema,
  CONTRACT_VERSION,
  RescueGrantResponseSchema,
  SessionHistoryResponseSchema,
  UserViewSchema,
} from "@pootown/game-contracts";

import type { ApiClient, MutationOptions } from "./api-client";

export function createAccountApi(client: ApiClient) {
  return {
    me() {
      return client.get("/v1/me", undefined, UserViewSchema, true);
    },
    balance() {
      return client.get("/v1/me/coins", undefined, CoinBalanceResponseSchema, true);
    },
    operations(options: { cursor?: string; limit?: number } = {}) {
      return client.get("/v1/me/coin-operations", options, CoinOperationsResponseSchema, true);
    },
    history(options: { cursor?: string; limit?: number } = {}) {
      return client.get("/v1/me/history", options, SessionHistoryResponseSchema, true);
    },
    rescue(mutation: MutationOptions) {
      return client.post(
        "/v1/me/coins/rescue",
        { contractVersion: CONTRACT_VERSION },
        RescueGrantResponseSchema,
        mutation,
      );
    },
  };
}
