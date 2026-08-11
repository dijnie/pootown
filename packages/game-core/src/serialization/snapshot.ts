import { SnapshotError } from "../errors";
import {
  GAME_SCHEMA_VERSION,
  MAXIMUM_PLAYERS,
  MAX_STATE_VERSION,
  MINIMUM_PLAYERS,
  activeSeats,
  occupiedSeats,
  type GameState,
  type PlayerSeat,
} from "../model/game-state";
import { gameId, playerId } from "../model/identifiers";
import { matchCash } from "../model/money";

interface SnapshotEnvelope {
  readonly schemaVersion: number;
  readonly stateVersion: number;
  readonly state: unknown;
  readonly checksum: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new SnapshotError(`${label} must be an object`);
  return value;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new SnapshotError(`${label} has unknown or missing fields`);
  }
}

function integer(value: unknown, label: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new SnapshotError(`${label} must be a safe integer between ${minimum} and ${maximum}`);
  }
  return value as number;
}

function nullableInteger(value: unknown, label: string): number | null {
  return value === null ? null : integer(value, label);
}

function nullableTimeLimit(value: unknown): number | null {
  return value === null ? null : integer(value, "timeLimitMs", 1, 86_400_000);
}

function decimal(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(value)) {
    throw new SnapshotError(`${label} must be a canonical unsigned decimal string`);
  }
  return BigInt(value);
}

function text(value: unknown, label: string, maximum = 256): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) {
    throw new SnapshotError(`${label} must be a bounded string`);
  }
  return value;
}

function opaqueIdentifier(value: unknown, label: string): string {
  const identifier = text(value, label, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(identifier)) {
    throw new SnapshotError(`${label} must be a valid opaque identifier`);
  }
  return identifier;
}

function serializeValue(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString(10);
  if (Array.isArray(value)) return value.map(serializeValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serializeValue(entry)]));
  }
  return value;
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalStringify(entry)}`).join(",")}}`;
}

function checksum(value: unknown): string {
  const input = canonicalStringify(value);
  let hash = 0xcbf29ce484222325n;
  for (const character of input) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function hydrateSeat(value: unknown, expectedIndex: number): PlayerSeat | null {
  if (value === null) return null;
  const seat = record(value, `seats[${expectedIndex}]`);
  exactKeys(seat, ["seatIndex", "playerId", "status", "cash", "position", "inJail", "joinedAtMs"], `seats[${expectedIndex}]`);
  const seatIndex = integer(seat.seatIndex, "seatIndex", 0, 3);
  if (seatIndex !== expectedIndex) throw new SnapshotError("seat index does not match slot");
  if (seat.status !== "active" && seat.status !== "eliminated") {
    throw new SnapshotError("seat status is invalid");
  }
  if (typeof seat.inJail !== "boolean") throw new SnapshotError("inJail must be boolean");
  return {
    seatIndex,
    playerId: playerId(opaqueIdentifier(seat.playerId, "playerId")),
    status: seat.status,
    cash: matchCash(decimal(seat.cash, "cash")),
    position: integer(seat.position, "position", 0, 39),
    inJail: seat.inJail,
    joinedAtMs: integer(seat.joinedAtMs, "joinedAtMs"),
  };
}

function hydrateState(value: unknown): GameState {
  const state = record(value, "state");
  exactKeys(
    state,
    [
      "schemaVersion", "stateVersion", "gameId", "creatorId", "lifecycle", "minimumPlayers",
      "maximumPlayers", "seats", "bankCash", "freeParkingPool", "housesRemaining",
      "hotelsRemaining", "createdAtMs", "startedAtMs", "cancelledAtMs", "timeLimitMs",
      "gameEndAtMs", "turnTimeoutMs", "turn", "rng",
    ],
    "state",
  );
  if (state.schemaVersion !== GAME_SCHEMA_VERSION) throw new SnapshotError("unsupported game schema version");
  if (state.minimumPlayers !== MINIMUM_PLAYERS) throw new SnapshotError("minimum player rule is invalid");
  const maximumPlayers = integer(state.maximumPlayers, "maximumPlayers", MINIMUM_PLAYERS, MAXIMUM_PLAYERS);
  if (!Array.isArray(state.seats) || state.seats.length !== MAXIMUM_PLAYERS) {
    throw new SnapshotError("snapshot must contain exactly four seat slots");
  }
  const seats = state.seats.map(hydrateSeat);
  if (seats.slice(maximumPlayers).some((seat) => seat !== null)) {
    throw new SnapshotError("seat outside configured capacity is occupied");
  }
  const rng = record(state.rng, "rng");
  exactKeys(rng, ["algorithm", "state", "draws", "bytesConsumed"], "rng");
  const turn = record(state.turn, "turn");
  const common = {
    schemaVersion: GAME_SCHEMA_VERSION,
    stateVersion: integer(state.stateVersion, "stateVersion", 1, MAX_STATE_VERSION),
    gameId: gameId(opaqueIdentifier(state.gameId, "gameId")),
    creatorId: playerId(opaqueIdentifier(state.creatorId, "creatorId")),
    minimumPlayers: MINIMUM_PLAYERS,
    maximumPlayers,
    seats,
    bankCash: matchCash(decimal(state.bankCash, "bankCash")),
    freeParkingPool: matchCash(decimal(state.freeParkingPool, "freeParkingPool")),
    housesRemaining: integer(state.housesRemaining, "housesRemaining", 0, 32),
    hotelsRemaining: integer(state.hotelsRemaining, "hotelsRemaining", 0, 12),
    createdAtMs: integer(state.createdAtMs, "createdAtMs"),
    timeLimitMs: nullableTimeLimit(state.timeLimitMs),
    turnTimeoutMs: integer(state.turnTimeoutMs, "turnTimeoutMs", 1, 86_400_000),
    rng: {
      algorithm: text(rng.algorithm, "rng.algorithm", 64),
      state: text(rng.state, "rng.state", 4_096),
      draws: integer(rng.draws, "rng.draws"),
      bytesConsumed: integer(rng.bytesConsumed, "rng.bytesConsumed"),
    },
  };

  let result: GameState;
  if (state.lifecycle === "waitingForPlayers") {
    exactKeys(turn, ["phase"], "turn");
    if (turn.phase !== "notStarted" || state.startedAtMs !== null || state.cancelledAtMs !== null || state.gameEndAtMs !== null) {
      throw new SnapshotError("waiting lifecycle fields are inconsistent");
    }
    result = { ...common, lifecycle: "waitingForPlayers", startedAtMs: null, cancelledAtMs: null, gameEndAtMs: null, turn: { phase: "notStarted" } };
  } else if (state.lifecycle === "inProgress") {
    exactKeys(turn, ["phase", "currentSeatIndex", "startedAtMs", "deadlineAtMs"], "turn");
    if (turn.phase !== "awaitingRoll" || state.cancelledAtMs !== null) throw new SnapshotError("active lifecycle fields are inconsistent");
    result = {
      ...common,
      lifecycle: "inProgress",
      startedAtMs: integer(state.startedAtMs, "startedAtMs"),
      cancelledAtMs: null,
      gameEndAtMs: nullableInteger(state.gameEndAtMs, "gameEndAtMs"),
      turn: {
        phase: "awaitingRoll",
        currentSeatIndex: integer(turn.currentSeatIndex, "currentSeatIndex", 0, 3),
        startedAtMs: integer(turn.startedAtMs, "turn.startedAtMs"),
        deadlineAtMs: integer(turn.deadlineAtMs, "turn.deadlineAtMs"),
      },
    };
  } else if (state.lifecycle === "cancelled") {
    exactKeys(turn, ["phase"], "turn");
    if (turn.phase !== "finished" || state.startedAtMs !== null || state.gameEndAtMs !== null) throw new SnapshotError("cancelled lifecycle fields are inconsistent");
    result = { ...common, lifecycle: "cancelled", startedAtMs: null, cancelledAtMs: integer(state.cancelledAtMs, "cancelledAtMs"), gameEndAtMs: null, turn: { phase: "finished" } };
  } else if (state.lifecycle === "finished") {
    exactKeys(turn, ["phase"], "turn");
    if (turn.phase !== "finished" || state.cancelledAtMs !== null) throw new SnapshotError("finished lifecycle fields are inconsistent");
    result = { ...common, lifecycle: "finished", startedAtMs: integer(state.startedAtMs, "startedAtMs"), cancelledAtMs: null, gameEndAtMs: integer(state.gameEndAtMs, "gameEndAtMs"), turn: { phase: "finished" } };
  } else {
    throw new SnapshotError("unknown lifecycle");
  }

  const occupied = occupiedSeats(result);
  if (occupied.length < 1 || result.seats[0]?.playerId !== result.creatorId) throw new SnapshotError("creator must occupy seat zero");
  if (new Set(occupied.map((seat) => seat.playerId)).size !== occupied.length) throw new SnapshotError("player IDs must be unique");
  if (activeSeats(result).length < 1) throw new SnapshotError("game must retain at least one active player");
  if (occupied.some((seat) => seat.joinedAtMs < result.createdAtMs)) {
    throw new SnapshotError("seat join timestamp predates the game");
  }
  if (result.lifecycle === "waitingForPlayers" && occupied.some((seat) => seat.status !== "active")) {
    throw new SnapshotError("waiting games cannot contain eliminated players");
  }
  if (result.lifecycle === "inProgress") {
    if (occupied.length < result.minimumPlayers || result.startedAtMs < result.createdAtMs) {
      throw new SnapshotError("active lifecycle has invalid player count or start time");
    }
    const currentSeat = result.seats[result.turn.currentSeatIndex];
    if (currentSeat === null || currentSeat === undefined || currentSeat.status !== "active") {
      throw new SnapshotError("current turn must reference an active occupied seat");
    }
    if (
      result.turn.startedAtMs < result.startedAtMs ||
      result.turn.deadlineAtMs < result.turn.startedAtMs ||
      (result.gameEndAtMs !== null && result.gameEndAtMs < result.startedAtMs)
    ) {
      throw new SnapshotError("active lifecycle deadlines are inconsistent");
    }
  }
  if (result.lifecycle === "cancelled" && result.cancelledAtMs < result.createdAtMs) {
    throw new SnapshotError("cancellation predates the game");
  }
  if (
    result.lifecycle === "finished" &&
    (result.startedAtMs < result.createdAtMs || result.gameEndAtMs < result.startedAtMs)
  ) {
    throw new SnapshotError("finished lifecycle timestamps are inconsistent");
  }
  return result;
}

export function serializeSnapshot(state: GameState): string {
  const serializedState = serializeValue(state);
  hydrateState(serializedState);
  const signed = { schemaVersion: GAME_SCHEMA_VERSION, stateVersion: state.stateVersion, state: serializedState };
  return JSON.stringify({ ...signed, checksum: checksum(signed) });
}

export function parseSnapshot(serialized: string): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new SnapshotError("snapshot is not valid JSON");
  }
  const envelope = record(parsed, "snapshot") as unknown as SnapshotEnvelope;
  exactKeys(envelope as unknown as Record<string, unknown>, ["schemaVersion", "stateVersion", "state", "checksum"], "snapshot");
  if (envelope.schemaVersion !== GAME_SCHEMA_VERSION) throw new SnapshotError("unsupported snapshot schema version");
  const stateVersion = integer(envelope.stateVersion, "snapshot stateVersion", 1, MAX_STATE_VERSION);
  const expectedChecksum = checksum({ schemaVersion: envelope.schemaVersion, stateVersion, state: envelope.state });
  if (envelope.checksum !== expectedChecksum) throw new SnapshotError("snapshot checksum mismatch");
  const state = hydrateState(envelope.state);
  if (state.stateVersion !== stateVersion) throw new SnapshotError("snapshot revision mismatch");
  return state;
}
