import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  gameId,
  parseSnapshot,
  playerId,
  replay,
  serializeSnapshot,
  SnapshotError,
  transition,
  type GameCommand,
  type GameState,
  type PlayerId,
  type RandomCheckpoint,
  type RandomSource,
  type ReplayStep,
  type TransitionContext,
} from "../src";

class FixedRandomSource implements RandomSource {
  nextBytes(length: number): Uint8Array {
    return new Uint8Array(length);
  }

  checkpoint(): RandomCheckpoint {
    return { algorithm: "fixed-test-v1", state: "continuation-0", draws: 0, bytesConsumed: 0 };
  }

  canResume(checkpoint: RandomCheckpoint): boolean {
    return checkpoint.algorithm === "fixed-test-v1" && checkpoint.state === "continuation-0";
  }
}

const randomSource = new FixedRandomSource();

function context(actorId: PlayerId, nowMs: number): TransitionContext {
  return { actorId, nowMs, randomSource };
}

const creator = playerId("creator");
const second = playerId("second");

const create: GameCommand = {
  type: "createGame",
  expectedStateVersion: 0,
  payload: { gameId: gameId("game_replay"), maximumPlayers: 4, timeLimitMs: null },
};

function command(type: "joinGame" | "startGame" | "cancelGame", version: number): GameCommand {
  return { type, expectedStateVersion: version, payload: {} };
}

function run(steps: readonly ReplayStep[]): GameState {
  const result = replay(null, steps);
  assert.equal(result.ok, true, result.ok ? undefined : result.error.message);
  return result.state as GameState;
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalStringify(entry)}`)
    .join(",")}}`;
}

function checksum(value: unknown): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of canonicalStringify(value)) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function resign(snapshot: Record<string, unknown>): string {
  const signed = {
    schemaVersion: snapshot.schemaVersion,
    stateVersion: snapshot.stateVersion,
    state: snapshot.state,
  };
  return JSON.stringify({ ...signed, checksum: checksum(signed) });
}

describe("snapshot and replay", () => {
  const waitingSteps: ReplayStep[] = [
    { command: create, context: context(creator, 1_000) },
    { command: command("joinGame", 1), context: context(second, 1_001) },
  ];

  it("replays the same commands and contexts deterministically", () => {
    const first = replay(null, waitingSteps);
    const secondRun = replay(null, waitingSteps);
    assert.deepEqual(first, secondRun);
  });

  it("round-trips waiting, active, cancelled, and finished lifecycle snapshots", () => {
    const waiting = run(waitingSteps);
    const active = run([...waitingSteps, { command: command("startGame", 2), context: context(creator, 2_000) }]);
    const cancelled = run([...waitingSteps, { command: command("cancelGame", 2), context: context(creator, 2_000) }]);
    assert.equal(active.lifecycle, "inProgress");
    if (active.lifecycle !== "inProgress") return;
    const finished: GameState = {
      ...active,
      stateVersion: active.stateVersion + 1,
      lifecycle: "finished",
      cancelledAtMs: null,
      gameEndAtMs: 3_000,
      turn: { phase: "finished" },
    };

    for (const state of [waiting, active, cancelled, finished]) {
      assert.deepEqual(parseSnapshot(serializeSnapshot(state)), state);
    }
  });

  it("fails closed on corruption, future schemas, invalid bigint, extra fields, and revision mismatch", () => {
    const state = run(waitingSteps);
    const valid = serializeSnapshot(state);
    const corrupt = valid.replace("1000000", "1000001");
    assert.throws(() => parseSnapshot(corrupt), SnapshotError);

    const future = JSON.parse(valid) as Record<string, unknown>;
    future.schemaVersion = 3;
    assert.throws(() => parseSnapshot(JSON.stringify(future)), /unsupported snapshot schema version/);

    const legacy = JSON.parse(valid) as Record<string, unknown>;
    legacy.schemaVersion = 1;
    assert.throws(() => parseSnapshot(JSON.stringify(legacy)), /unsupported snapshot schema version/);

    const unknownRuleset = JSON.parse(valid) as Record<string, unknown>;
    (unknownRuleset.state as Record<string, unknown>).rulesetId = "invented-rules";
    assert.throws(() => parseSnapshot(resign(unknownRuleset)), /unsupported gameplay ruleset/);

    const alteredTurnPolicy = JSON.parse(valid) as Record<string, unknown>;
    (alteredTurnPolicy.state as Record<string, unknown>).turnTimeoutMs = 30_000;
    assert.throws(() => parseSnapshot(resign(alteredTurnPolicy)), /turnTimeoutMs/);

    const invalidMoney = JSON.parse(valid) as Record<string, unknown>;
    (invalidMoney.state as Record<string, unknown>).bankCash = "01";
    assert.throws(() => parseSnapshot(resign(invalidMoney)), /canonical unsigned decimal/);

    const extra = JSON.parse(valid) as Record<string, unknown>;
    (extra.state as Record<string, unknown>).wallet = "forbidden";
    assert.throws(() => parseSnapshot(resign(extra)), /unknown or missing fields/);

    const illegalTurn = JSON.parse(serializeSnapshot(run([
      ...waitingSteps,
      { command: command("startGame", 2), context: context(creator, 2_000) },
    ]))) as Record<string, unknown>;
    const illegalState = illegalTurn.state as Record<string, unknown>;
    (illegalState.turn as Record<string, unknown>).currentSeatIndex = 3;
    assert.throws(() => parseSnapshot(resign(illegalTurn)), /active occupied seat/);

    const missingCreatorSeat = JSON.parse(valid) as Record<string, unknown>;
    const missingCreatorState = missingCreatorSeat.state as Record<string, unknown>;
    const missingCreatorSeats = missingCreatorState.seats as Array<Record<string, unknown> | null>;
    const creatorSeat = missingCreatorSeats[0];
    assert.notEqual(creatorSeat, null);
    missingCreatorSeats[0] = null;
    missingCreatorSeats[1] = { ...(creatorSeat as Record<string, unknown>), seatIndex: 1 };
    assert.throws(() => parseSnapshot(resign(missingCreatorSeat)), /creator must occupy seat zero/);

    const invalidTimeLimit = JSON.parse(valid) as Record<string, unknown>;
    (invalidTimeLimit.state as Record<string, unknown>).timeLimitMs = 0;
    assert.throws(() => parseSnapshot(resign(invalidTimeLimit)), /timeLimitMs/);

    const mismatched = JSON.parse(valid) as Record<string, unknown>;
    mismatched.stateVersion = 99;
    assert.throws(() => parseSnapshot(resign(mismatched)), /revision mismatch/);
  });

  it("returns the rejection boundary and unchanged state during replay", () => {
    const created = transition(null, create, context(creator, 1));
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const result = replay(created.state, [
      { command: command("startGame", 1), context: context(creator, 2) },
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.failedStep, 0);
      assert.equal(result.error.code, "MINIMUM_PLAYERS_NOT_MET");
      assert.strictEqual(result.state, created.state);
    }
  });
});
