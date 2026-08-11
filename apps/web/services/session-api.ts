import {
  AdmissionResponseSchema,
  CONTRACT_VERSION,
  OperationResponseSchema,
  SessionDetailSchema,
  SessionListResponseSchema,
  type GameDefinitionId,
  type GameId,
} from "@pootown/game-contracts";

import type { ApiClient, MutationOptions } from "./api-client";

export function createSessionApi(client: ApiClient) {
  return {
    list(options: { cursor?: string; limit?: number } = {}) {
      return client.get("/v1/game-sessions", options, SessionListResponseSchema);
    },
    detail(gameId: GameId) {
      return client.get(`/v1/game-sessions/${gameId}`, undefined, SessionDetailSchema);
    },
    create(gameDefinitionId: GameDefinitionId, mutation: MutationOptions) {
      return client.post(
        "/v1/game-sessions",
        { contractVersion: CONTRACT_VERSION, gameDefinitionId },
        AdmissionResponseSchema,
        mutation,
      );
    },
    join(gameId: GameId, mutation: MutationOptions) {
      return client.post(
        `/v1/game-sessions/${gameId}/join-intents`,
        { contractVersion: CONTRACT_VERSION },
        AdmissionResponseSchema,
        mutation,
      );
    },
    release(gameId: GameId, mutation: MutationOptions) {
      return client.delete(
        `/v1/game-sessions/${gameId}/join-intent`,
        { contractVersion: CONTRACT_VERSION },
        OperationResponseSchema,
        mutation,
      );
    },
    cancel(gameId: GameId, mutation: MutationOptions) {
      return client.post(
        `/v1/game-sessions/${gameId}/cancel`,
        { contractVersion: CONTRACT_VERSION },
        OperationResponseSchema,
        mutation,
      );
    },
    reconnect(gameId: GameId, mutation: MutationOptions) {
      return client.post(
        `/v1/game-sessions/${gameId}/reconnect-ticket`,
        { contractVersion: CONTRACT_VERSION },
        AdmissionResponseSchema,
        mutation,
      );
    },
  };
}
