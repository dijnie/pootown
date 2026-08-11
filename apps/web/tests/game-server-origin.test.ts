import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeGameServerEndpoint } from "../services/game-server-origin";

describe("game server endpoint", () => {
  it("accepts only a canonical WebSocket endpoint", () => {
    assert.equal(normalizeGameServerEndpoint("wss://game.example/"), "wss://game.example");
    for (const endpoint of [
      "https://game.example",
      "wss://game.example/rooms",
      "wss://user:secret@game.example",
      "wss://game.example?ticket=secret",
      "wss://game.example#fragment",
      "not-a-url",
    ]) {
      assert.throws(() => normalizeGameServerEndpoint(endpoint));
    }
  });
});
