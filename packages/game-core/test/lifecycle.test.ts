import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import {
  gameId,
  MAX_STATE_VERSION,
  occupiedSeats,
  playerId,
  transition,
  type GameCommand,
  type GameState,
  type PlayerId,
  type RandomCheckpoint,
  type RandomSource,
  type TransitionContext,
} from "../src";

class TestRandomSource implements RandomSource {
  private cursor = 0;

  nextBytes(length: number): Uint8Array {
    const output = Uint8Array.from({ length }, (_, index) => (this.cursor + index) % 256);
    this.cursor += length;
    return output;
  }

  checkpoint(): RandomCheckpoint {
    return {
      algorithm: "deterministic-test-v1",
      state: String(this.cursor),
      draws: this.cursor === 0 ? 0 : 1,
      bytesConsumed: this.cursor,
    };
  }

  canResume(checkpoint: RandomCheckpoint): boolean {
    return checkpoint.algorithm === "deterministic-test-v1" && checkpoint.state === String(this.cursor);
  }
}

function context(
  actorId: PlayerId,
  nowMs: number,
  randomSource: RandomSource = new TestRandomSource(),
): TransitionContext {
  return { actorId, nowMs, randomSource };
}

function createCommand(maximumPlayers = 4): GameCommand {
  return {
    type: "createGame",
    expectedStateVersion: 0,
    payload: { gameId: gameId("game_1"), maximumPlayers, timeLimitMs: 60_000 },
  };
}

function emptyCommand(type: "joinGame" | "leaveGame" | "cancelGame" | "startGame", version: number): GameCommand {
  return { type, expectedStateVersion: version, payload: {} };
}

function accept(state: GameState | null, command: GameCommand, commandContext: TransitionContext): GameState {
  const result = transition(state, command, commandContext);
  assert.equal(result.ok, true, result.ok ? undefined : result.error.message);
  return result.state as GameState;
}

describe("core lifecycle", () => {
  it("maps the characterized create and join fixture without Solana shapes", () => {
    const fixture = JSON.parse(
      readFileSync(resolve(process.cwd(), "../../tests/fixtures/executed-rules/lifecycle.json"), "utf8"),
    ) as {
      initial: {
        status: string;
        currentPlayers: number;
        playersLength: number;
        maximumPlayers: number;
        startingInMatchCash: number;
        bankBalance: number;
        housesRemaining: number;
        hotelsRemaining: number;
      };
      afterJoins: {
        currentPlayers: number;
        playersLength: number;
        activePlayers: number;
        totalPlayers: number;
        event: { playerIndexes: number[]; totalPlayers: number[] };
      };
      rejections: Record<string, string>;
      cancelled: {
        event: { name: string; playersCount: number };
      };
    };
    const creator = playerId("creator");
    let state = accept(null, createCommand(), context(creator, 1_000));

    assert.equal(state.lifecycle, "waitingForPlayers");
    assert.equal(state.lifecycle, fixture.initial.status);
    assert.equal(state.stateVersion, 1);
    assert.equal(occupiedSeats(state).length, fixture.initial.currentPlayers);
    assert.equal(occupiedSeats(state).length, fixture.initial.playersLength);
    assert.equal(state.maximumPlayers, fixture.initial.maximumPlayers);
    assert.equal(state.seats[0]?.playerId, creator);
    assert.equal(state.seats[0]?.cash, BigInt(fixture.initial.startingInMatchCash));
    assert.equal(state.bankCash, BigInt(fixture.initial.bankBalance));
    assert.equal(state.housesRemaining, fixture.initial.housesRemaining);
    assert.equal(state.hotelsRemaining, fixture.initial.hotelsRemaining);

    const observedIndexes: number[] = [];
    const observedTotals: number[] = [];
    for (const [offset, name] of ["player_2", "player_3", "player_4"].entries()) {
      const result = transition(
        state,
        emptyCommand("joinGame", state.stateVersion),
        context(playerId(name), 2_000 + offset),
      );
      assert.equal(result.ok, true);
      if (!result.ok) continue;
      const event = result.events[0];
      assert.equal(event?.type, "playerJoined");
      if (event?.type === "playerJoined") {
        observedIndexes.push(event.seatIndex);
        observedTotals.push(event.totalPlayers);
      }
      assert.equal(result.state.stateVersion, state.stateVersion + 1);
      state = result.state;
    }

    assert.deepEqual(observedIndexes, fixture.afterJoins.event.playerIndexes);
    assert.deepEqual(observedTotals, fixture.afterJoins.event.totalPlayers);
    assert.equal(occupiedSeats(state).length, fixture.afterJoins.currentPlayers);
    assert.equal(occupiedSeats(state).length, fixture.afterJoins.playersLength);
    assert.equal(occupiedSeats(state).length, fixture.afterJoins.activePlayers);
    assert.equal(occupiedSeats(state).length, fixture.afterJoins.totalPlayers);

    const cancelled = transition(
      state,
      emptyCommand("cancelGame", state.stateVersion),
      context(creator, 3_000),
    );
    assert.equal(cancelled.ok, true);
    if (cancelled.ok) {
      assert.equal(cancelled.state.lifecycle, "cancelled");
      assert.equal(cancelled.events[0]?.type, fixture.cancelled.event.name);
      assert.deepEqual(cancelled.events[0], {
        type: "gameCancelled",
        playersCount: fixture.cancelled.event.playersCount,
      });
    }
  });

  it("rejects stale, duplicate, full, premature, and unauthorized commands without mutation", () => {
    const fixture = JSON.parse(
      readFileSync(resolve(process.cwd(), "../../tests/fixtures/executed-rules/lifecycle.json"), "utf8"),
    ) as { rejections: Record<string, string> };
    const mappedError = {
      minimumPlayersNotMet: "MINIMUM_PLAYERS_NOT_MET",
      unauthorizedCreator: "UNAUTHORIZED_ACTOR",
      unauthorizedPlatformAdmin: "API_OWNED",
      duplicateSeatRejected: "PLAYER_ALREADY_JOINED",
      maximumPlayersReached: "GAME_FULL",
    } as const;
    const creator = playerId("creator");
    const second = playerId("second");
    let state = accept(null, createCommand(), context(creator, 1_000));

    const premature = transition(state, emptyCommand("startGame", 1), context(creator, 1_001));
    assert.equal(premature.ok, false);
    if (!premature.ok) {
      assert.equal(premature.error.code, mappedError[fixture.rejections.prematureStart as keyof typeof mappedError]);
      assert.strictEqual(premature.state, state);
    }

    state = accept(state, emptyCommand("joinGame", 1), context(second, 1_002));
    const stale = transition(state, emptyCommand("startGame", 1), context(creator, 1_003));
    assert.equal(stale.ok, false);
    if (!stale.ok) {
      assert.equal(stale.error.code, "STALE_STATE_VERSION");
      assert.equal(stale.error.retryable, true);
      assert.strictEqual(stale.state, state);
    }

    const unauthorized = transition(
      state,
      emptyCommand("startGame", state.stateVersion),
      context(second, 1_004),
    );
    assert.equal(unauthorized.ok, false);
    if (!unauthorized.ok) {
      assert.equal(unauthorized.error.code, mappedError[fixture.rejections.unauthorizedStart as keyof typeof mappedError]);
      assert.strictEqual(unauthorized.state, state);
    }

    const duplicate = transition(
      state,
      emptyCommand("joinGame", state.stateVersion),
      context(second, 1_005),
    );
    assert.equal(duplicate.ok, false);
    if (!duplicate.ok) {
      assert.equal(duplicate.error.code, mappedError[fixture.rejections.duplicateJoin as keyof typeof mappedError]);
      assert.strictEqual(duplicate.state, state);
    }

    state = accept(state, emptyCommand("joinGame", 2), context(playerId("third"), 1_006));
    state = accept(state, emptyCommand("joinGame", 3), context(playerId("fourth"), 1_007));
    const full = transition(
      state,
      emptyCommand("joinGame", state.stateVersion),
      context(playerId("fifth"), 1_008),
    );
    assert.equal(full.ok, false);
    if (!full.ok) {
      assert.equal(full.error.code, mappedError[fixture.rejections.fullJoin as keyof typeof mappedError]);
      assert.strictEqual(full.state, state);
    }
    assert.equal(
      mappedError[fixture.rejections.unauthorizedPlatformUpdate as keyof typeof mappedError],
      "API_OWNED",
    );
  });

  it("returns stable errors for missing, duplicate, closed, leave, and invalid-time boundaries", () => {
    const creator = playerId("creator");
    const stranger = playerId("stranger");
    const missing = transition(null, emptyCommand("joinGame", 0), context(stranger, 1));
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.error.code, "GAME_NOT_FOUND");
      assert.equal(missing.state, null);
    }

    const state = accept(null, createCommand(), context(creator, 1));
    const duplicateGame = transition(state, createCommand(), context(creator, 2));
    assert.equal(duplicateGame.ok, false);
    if (!duplicateGame.ok) {
      assert.equal(duplicateGame.error.code, "GAME_ALREADY_EXISTS");
      assert.strictEqual(duplicateGame.state, state);
    }

    const creatorLeave = transition(state, emptyCommand("leaveGame", 1), context(creator, 2));
    assert.equal(creatorLeave.ok, false);
    if (!creatorLeave.ok) {
      assert.equal(creatorLeave.error.code, "CREATOR_CANNOT_LEAVE");
      assert.strictEqual(creatorLeave.state, state);
    }

    const missingPlayer = transition(state, emptyCommand("leaveGame", 1), context(stranger, 2));
    assert.equal(missingPlayer.ok, false);
    if (!missingPlayer.ok) {
      assert.equal(missingPlayer.error.code, "PLAYER_NOT_FOUND");
      assert.strictEqual(missingPlayer.state, state);
    }

    const invalidNow = transition(state, emptyCommand("joinGame", 1), context(stranger, -1));
    assert.equal(invalidNow.ok, false);
    if (!invalidNow.ok) {
      assert.equal(invalidNow.error.code, "INVALID_COMMAND");
      assert.strictEqual(invalidNow.state, state);
    }

    const backwardsTime = transition(state, emptyCommand("joinGame", 1), context(stranger, 0));
    assert.equal(backwardsTime.ok, false);
    if (!backwardsTime.ok) {
      assert.equal(backwardsTime.error.code, "INVALID_STATE");
      assert.strictEqual(backwardsTime.state, state);
    }

    const invalidTimeLimit = transition(
      null,
      {
        type: "createGame",
        expectedStateVersion: 0,
        payload: { gameId: gameId("invalid_time"), maximumPlayers: 4, timeLimitMs: 86_400_001 },
      },
      context(creator, 1),
    );
    assert.equal(invalidTimeLimit.ok, false);
    if (!invalidTimeLimit.ok) assert.equal(invalidTimeLimit.error.code, "INVALID_COMMAND");

    const invalidCheckpointSource: RandomSource = {
      nextBytes: (length) => new Uint8Array(length),
      checkpoint: () => ({ algorithm: "", state: "", draws: -1, bytesConsumed: -1 }),
      canResume: () => false,
    };
    const invalidCheckpoint = transition(
      null,
      createCommand(),
      context(creator, 1, invalidCheckpointSource),
    );
    assert.equal(invalidCheckpoint.ok, false);
    if (!invalidCheckpoint.ok) assert.equal(invalidCheckpoint.error.code, "INVALID_STATE");

    const throwingCheckpointSource: RandomSource = {
      nextBytes: (length) => new Uint8Array(length),
      checkpoint: () => {
        throw new Error("adapter failure");
      },
      canResume: () => {
        throw new Error("adapter failure");
      },
    };
    const throwingCheckpoint = transition(
      null,
      createCommand(),
      context(creator, 1, throwingCheckpointSource),
    );
    assert.equal(throwingCheckpoint.ok, false);
    if (!throwingCheckpoint.ok) assert.equal(throwingCheckpoint.error.code, "INVALID_STATE");
  });

  it("enforces configured capacities across the supported two-to-four range", () => {
    const creator = playerId("creator");
    let state = accept(null, createCommand(2), context(creator, 1));
    state = accept(state, emptyCommand("joinGame", 1), context(playerId("second"), 2));
    const full = transition(state, emptyCommand("joinGame", 2), context(playerId("third"), 3));
    assert.equal(full.ok, false);
    if (!full.ok) assert.equal(full.error.code, "GAME_FULL");

    for (const capacity of [1, 5]) {
      const invalid = transition(null, createCommand(capacity), context(creator, 1));
      assert.equal(invalid.ok, false);
      if (!invalid.ok) assert.equal(invalid.error.code, "INVALID_COMMAND");
    }
  });

  it("preserves occupied seat indexes when a waiting player leaves and the slot is reused", () => {
    const creator = playerId("creator");
    const second = playerId("second");
    const third = playerId("third");
    let state = accept(null, createCommand(), context(creator, 1));
    state = accept(state, emptyCommand("joinGame", 1), context(second, 2));
    state = accept(state, emptyCommand("joinGame", 2), context(third, 3));

    const left = transition(state, emptyCommand("leaveGame", 3), context(second, 4));
    assert.equal(left.ok, true);
    if (!left.ok) return;
    assert.equal(left.state.seats[1], null);
    assert.equal(left.state.seats[2]?.playerId, third);
    assert.equal(left.events[0]?.type, "playerLeft");

    const rejoined = transition(
      left.state,
      emptyCommand("joinGame", 4),
      context(playerId("replacement"), 5),
    );
    assert.equal(rejoined.ok, true);
    if (!rejoined.ok) return;
    assert.equal(rejoined.state.seats[1]?.playerId, playerId("replacement"));
    assert.equal(rejoined.state.seats[2]?.playerId, third);
  });

  it("starts with two players using the frozen source semantics, not the legacy runtime crash", () => {
    const creator = playerId("creator");
    let state = accept(null, createCommand(), context(creator, 10_000));
    state = accept(state, emptyCommand("joinGame", 1), context(playerId("second"), 10_001));
    const started = transition(state, emptyCommand("startGame", 2), context(creator, 20_000));

    assert.equal(started.ok, true);
    if (!started.ok) return;
    assert.equal(started.state.lifecycle, "inProgress");
    assert.equal(started.state.stateVersion, 3);
    assert.equal(started.state.startedAtMs, 20_000);
    assert.equal(started.state.gameEndAtMs, 80_000);
    assert.deepEqual(started.state.turn, {
      phase: "awaitingRoll",
      currentSeatIndex: 0,
      startedAtMs: 20_000,
      deadlineAtMs: 50_000,
    });
    assert.deepEqual(started.events, [{ type: "gameStarted", totalPlayers: 2 }]);
  });

  it("rejects commands after start and timestamp overflow without changing state", () => {
    const creator = playerId("creator");
    let state = accept(null, createCommand(), context(creator, 1));
    state = accept(state, emptyCommand("joinGame", 1), context(playerId("second"), 2));

    const overflow = transition(
      state,
      emptyCommand("startGame", 2),
      context(creator, Number.MAX_SAFE_INTEGER),
    );
    assert.equal(overflow.ok, false);
    if (!overflow.ok) {
      assert.equal(overflow.error.code, "INVALID_STATE");
      assert.strictEqual(overflow.state, state);
    }

    const exhaustedVersion = { ...state, stateVersion: MAX_STATE_VERSION };
    const versionOverflow = transition(
      exhaustedVersion,
      emptyCommand("startGame", MAX_STATE_VERSION),
      context(creator, 3),
    );
    assert.equal(versionOverflow.ok, false);
    if (!versionOverflow.ok) {
      assert.equal(versionOverflow.error.code, "INVALID_STATE");
      assert.strictEqual(versionOverflow.state, exhaustedVersion);
    }

    const incompatibleRandomSource: RandomSource = {
      nextBytes: (length) => new Uint8Array(length),
      checkpoint: () => ({ algorithm: "other", state: "0", draws: 0, bytesConsumed: 0 }),
      canResume: () => false,
    };
    const incompatibleRng = transition(
      state,
      emptyCommand("startGame", 2),
      context(creator, 3, incompatibleRandomSource),
    );
    assert.equal(incompatibleRng.ok, false);
    if (!incompatibleRng.ok) {
      assert.equal(incompatibleRng.error.code, "INVALID_STATE");
      assert.strictEqual(incompatibleRng.state, state);
    }

    const throwingResumeSource: RandomSource = {
      nextBytes: (length) => new Uint8Array(length),
      checkpoint: () => ({
        algorithm: "deterministic-test-v1",
        state: "0",
        draws: 0,
        bytesConsumed: 0,
      }),
      canResume: () => {
        throw new Error("adapter failure");
      },
    };
    const throwingResume = transition(
      state,
      emptyCommand("startGame", 2),
      context(creator, 3, throwingResumeSource),
    );
    assert.equal(throwingResume.ok, false);
    if (!throwingResume.ok) {
      assert.equal(throwingResume.error.code, "INVALID_STATE");
      assert.strictEqual(throwingResume.state, state);
    }

    const started = accept(state, emptyCommand("startGame", 2), context(creator, 3));
    const closed = transition(started, emptyCommand("joinGame", 3), context(playerId("third"), 4));
    assert.equal(closed.ok, false);
    if (!closed.ok) {
      assert.equal(closed.error.code, "GAME_NOT_WAITING");
      assert.strictEqual(closed.state, started);
    }
  });

  it("allows only the creator to cancel and returns a terminal audit state", () => {
    const creator = playerId("creator");
    const second = playerId("second");
    let state = accept(null, createCommand(), context(creator, 1));
    state = accept(state, emptyCommand("joinGame", 1), context(second, 2));

    const unauthorized = transition(state, emptyCommand("cancelGame", 2), context(second, 3));
    assert.equal(unauthorized.ok, false);
    if (!unauthorized.ok) {
      assert.equal(unauthorized.error.code, "UNAUTHORIZED_ACTOR");
      assert.strictEqual(unauthorized.state, state);
    }

    const cancelled = transition(state, emptyCommand("cancelGame", 2), context(creator, 4));
    assert.equal(cancelled.ok, true);
    if (!cancelled.ok) return;
    assert.equal(cancelled.state.lifecycle, "cancelled");
    assert.equal(cancelled.state.stateVersion, 3);
    assert.equal(occupiedSeats(cancelled.state).length, 2);
    assert.deepEqual(cancelled.events, [{ type: "gameCancelled", playersCount: 2 }]);
  });
});
