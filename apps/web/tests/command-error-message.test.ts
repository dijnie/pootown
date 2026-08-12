import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CommandRejectionSchema } from "@pootown/game-contracts";

import { commandErrorMessage } from "../services/command-error-message.js";
import {
  CommandRejectedError,
  RoomTransportError,
} from "../services/game-room-client.js";

function rejection(
  code:
    | "STALE_STATE_VERSION"
    | "UNAUTHORIZED_ACTOR"
    | "INVALID_PHASE"
    | "INVALID_STATE"
) {
  return new CommandRejectedError(
    CommandRejectionSchema.parse({
      type: "command.reject",
      requestId: "00000000-0000-4000-8000-000000000001",
      stateVersion: 7,
      code,
      message: "internal detail",
      retryable: code === "STALE_STATE_VERSION",
    })
  );
}

describe("command error messages", () => {
  it("maps protocol failures to bounded player-facing guidance", () => {
    assert.match(
      commandErrorMessage(rejection("STALE_STATE_VERSION")),
      /latest state/
    );
    assert.match(
      commandErrorMessage(rejection("UNAUTHORIZED_ACTOR")),
      /not available/
    );
    assert.match(
      commandErrorMessage(rejection("INVALID_PHASE")),
      /current turn/
    );
    assert.doesNotMatch(
      commandErrorMessage(rejection("INVALID_STATE")),
      /internal detail/
    );
  });

  it("does not expose transport or arbitrary exception details", () => {
    assert.match(
      commandErrorMessage(new RoomTransportError(4503)),
      /interrupted/
    );
    assert.equal(
      commandErrorMessage(new Error("secret-ticket-value")),
      "The action could not be completed. Please try again."
    );
  });
});
