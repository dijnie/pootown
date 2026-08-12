import type { Room } from "@colyseus/sdk";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import WebSocket, { type ClientOptions } from "ws";

type Admission = {
  session: { gameId: string };
  admission: { playerId: string; ticket: string };
};

type PublicState = {
  stateVersion: number;
  gameId: string;
  seats: Array<{ playerId: string; status?: string; cash?: string } | null>;
  turn: Record<string, unknown> & { phase: string; currentSeatIndex?: number; deadlineAtMs?: number };
};

type LoadPlayer = {
  userId: string;
  accessToken: string;
  admission: Admission;
  room?: Room;
  state?: PublicState;
  terminalLoad?: boolean;
};

const environment = process.env;
const apiUrl = required("LOAD_API_URL");
const gameServerUrl = required("LOAD_GAME_SERVER_URL");
const gameServerOrigin = required("LOAD_GAME_SERVER_ORIGIN");
const databaseUrl = required("LOAD_DATABASE_URL");
const accessSecret = required("LOAD_ACCESS_SECRET");
const issuer = environment["LOAD_AUTH_ISSUER"] ?? "pootown-api";
const audience = environment["LOAD_AUTH_AUDIENCE"] ?? "pootown-web";
const playersCount = positiveInteger("LOAD_PLAYERS", 200);
const roomsCount = positiveInteger("LOAD_ROOMS", 50);
const durationMs = positiveInteger("LOAD_DURATION_SECONDS", 1_800) * 1_000;
const commandIntervalMs = positiveInteger("LOAD_COMMAND_INTERVAL_MS", 1_000);
const terminalRoomsCount = nonnegativeInteger("LOAD_TERMINAL_ROOMS", 1);
const outputPath = environment["LOAD_REPORT_PATH"]
  ?? "plans/260811-0313-nestjs-colyseus-monorepo-refactor/reports/phase-07-load-results.json";
const databaseCpuPath = required("LOAD_DATABASE_CPU_PATH");
const databaseCpuCores = positiveInteger("LOAD_DATABASE_CPU_CORES", 1);
const gitCommit = required("LOAD_GIT_COMMIT");
const sourceManifestSha256 = required("LOAD_SOURCE_MANIFEST_SHA256");
const invocation = required("LOAD_INVOCATION");
const propertyPrices = new Map<number, bigint>([
  [1, 60n], [3, 60n], [5, 200n], [6, 100n], [8, 100n], [9, 120n],
  [11, 140n], [12, 150n], [13, 140n], [14, 160n], [15, 200n], [16, 180n],
  [18, 180n], [19, 200n], [21, 220n], [23, 220n], [24, 240n], [25, 200n],
  [26, 260n], [27, 260n], [28, 150n], [29, 280n], [31, 300n], [32, 300n],
  [34, 320n], [35, 200n], [37, 350n], [39, 400n],
]);

if (playersCount !== roomsCount * 4) throw new Error("Load gate requires exactly four players per room");
if (terminalRoomsCount > roomsCount) throw new Error("Terminal load rooms cannot exceed total rooms");

const pool = new Pool({ connectionString: databaseUrl, max: 20 });
class OriginWebSocket extends WebSocket {
  public constructor(address: string | URL, options: ClientOptions = {}) {
    super(address, { ...options, origin: gameServerOrigin });
  }
}
Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: OriginWebSocket });
const { Client } = await import("@colyseus/sdk");
const colyseus = new Client(gameServerUrl);
const joinLatencies: number[] = [];
const acknowledgementLatencies: number[] = [];
const requestIds = new Set<string>();
let acknowledgements = 0;
let rejections = 0;
let reconnects = 0;
const commandMix = new Map<string, number>();

function required(name: string): string {
  const value = environment[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

function positiveInteger(name: string, fallback: number): number {
  const value = environment[name] === undefined ? fallback : Number(environment[name]);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function nonnegativeInteger(name: string, fallback: number): number {
  const value = environment[name] === undefined ? fallback : Number(environment[name]);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a nonnegative integer`);
  return value;
}

function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
}

async function runInBatches<T>(
  values: readonly T[],
  batchSize: number,
  work: (value: T) => Promise<void>,
): Promise<void> {
  for (let offset = 0; offset < values.length; offset += batchSize) {
    await Promise.all(values.slice(offset, offset + batchSize).map(work));
  }
}

async function api<T>(player: LoadPlayer, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${player.accessToken}`,
      "content-type": "application/json",
      "x-contract-version": "1",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `API ${init.method ?? "GET"} ${path} failed with ${response.status}: ${errorBody.slice(0, 500)}`,
    );
  }
  return await response.json() as T;
}

async function mutation<T>(player: LoadPlayer, path: string, body: unknown): Promise<T> {
  return api<T>(player, path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "idempotency-key": randomUUID() },
  });
}

async function createPlayers(): Promise<LoadPlayer[]> {
  const now = new Date();
  const users = Array.from({ length: playersCount }, (_, index) => `load_user_${String(index).padStart(4, "0")}`);
  await pool.query(
    `INSERT INTO identity.users (id, email, password_hash, created_at, updated_at, last_seen_at)
     SELECT id, id || '@load.invalid', '$2b$12$C6UzMDM.H6dfI/f/IKcEe.8lY5fYp6XvFwvMZg4lH8zcQxG6F6I5K', $2, $2, $2
     FROM unnest($1::varchar[]) AS id`,
    [users, now],
  );
  const secret = new TextEncoder().encode(accessSecret);
  const players = await Promise.all(users.map(async (userId, index) => {
    const accessToken = await new SignJWT({ sid: `load_session_${index}` })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(issuer).setAudience(audience).setSubject(userId)
      .setIssuedAt().setExpirationTime("1h").sign(secret);
    const player = { userId, accessToken } as LoadPlayer;
    return player;
  }));
  await runInBatches(players, 10, (player) => api(player, "/v1/me").then(() => undefined));
  return players;
}

async function admitPlayers(players: LoadPlayer[]): Promise<LoadPlayer[][]> {
  const groups = Array.from({ length: roomsCount }, (_, roomIndex) =>
    players.slice(roomIndex * 4, roomIndex * 4 + 4));
  await runInBatches(groups.map((group, roomIndex) => ({ group, roomIndex })), 3, async ({ group, roomIndex }) => {
    const creator = group[0];
    if (creator === undefined) throw new Error("Creator missing");
    for (const player of group) player.terminalLoad = roomIndex < terminalRoomsCount;
    creator.admission = await mutation<Admission>(creator, "/v1/game-sessions", {
      contractVersion: 1,
      gameDefinitionId: roomIndex < terminalRoomsCount ? "load_short" : "load_classic",
    });
    await Promise.all(group.slice(1).map(async (player) => {
      const started = performance.now();
      player.admission = await mutation<Admission>(
        player,
        `/v1/game-sessions/${creator.admission.session.gameId}/join-intents`,
        { contractVersion: 1 },
      );
      joinLatencies.push(performance.now() - started);
    }));
  });
  return groups;
}

function wireState(room: Room): PublicState {
  const wire = room.state as unknown as { publicStateJson?: unknown };
  if (typeof wire.publicStateJson !== "string") throw new Error("Room public state is unavailable");
  return JSON.parse(wire.publicStateJson) as PublicState;
}

async function waitForWireState(room: Room): Promise<PublicState> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      return wireState(room);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error("Room public state is unavailable");
}

async function connectPlayer(player: LoadPlayer): Promise<void> {
  const room = await colyseus.joinOrCreate("game", {
    contractVersion: 1,
    gameId: player.admission.session.gameId,
    ticket: player.admission.admission.ticket,
  });
  player.room = room;
  room.onMessage("domain.event", () => undefined);
  room.onMessage("player.private", () => undefined);
  room.onMessage("session.status", () => undefined);
  room.onMessage("clock.sync", () => undefined);
  room.onMessage("auth.expiring", () => undefined);
  room.onMessage("auth.revoked", () => undefined);
  room.onStateChange(() => {
    try { player.state = wireState(room); } catch { /* Initial schema patch is incomplete. */ }
  });
  player.state = await waitForWireState(room);
}

async function sendCommand(
  player: LoadPlayer,
  type: string,
  payload: Record<string, unknown> = {},
  requestId = randomUUID(),
): Promise<number> {
  const room = player.room;
  const state = player.state;
  if (room === undefined || state === undefined) throw new Error("Player room is unavailable");
  requestIds.add(requestId);
  const started = performance.now();
  const committedStateVersion = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Command ${type} timed out`)), 5_000);
    const disposeAck = room.onMessage("command.ack", (message: { requestId?: unknown; stateVersion?: unknown }) => {
      if (message.requestId !== requestId) return;
      if (!Number.isSafeInteger(message.stateVersion) || Number(message.stateVersion) <= state.stateVersion) {
        clearTimeout(timer);
        disposeAck();
        disposeReject();
        reject(new Error(`Command ${type} returned an invalid committed state version`));
        return;
      }
      clearTimeout(timer);
      disposeAck();
      disposeReject();
      acknowledgements += 1;
      commandMix.set(type, (commandMix.get(type) ?? 0) + 1);
      acknowledgementLatencies.push(performance.now() - started);
      resolve(Number(message.stateVersion));
    });
    const disposeReject = room.onMessage(
      "command.reject",
      (message: {
        requestId?: unknown;
        code?: unknown;
        message?: unknown;
        stateVersion?: unknown;
        error?: { code?: unknown; message?: unknown };
      }) => {
      if (message.requestId !== requestId) return;
      clearTimeout(timer);
      disposeAck();
      disposeReject();
        rejections += 1;
        reject(new Error(
          `Command ${type} was rejected with ${String(message.code ?? message.error?.code ?? "unknown")}: ` +
          `${String(message.message ?? message.error?.message ?? "no message")} ` +
          `(expected=${state.stateVersion}, server=${String(message.stateVersion ?? "unknown")}, ` +
          `phase=${String(state.turn.phase)}, payload=${JSON.stringify(payload)})`,
        ));
      },
    );
    room.send("command", {
      requestId,
      expectedStateVersion: state.stateVersion,
      type,
      payload,
    });
  });
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if ((player.state?.stateVersion ?? -1) >= committedStateVersion) return committedStateVersion;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`Command ${type} state patch timed out`);
}

async function exchangeMoneyTrade(group: LoadPlayer[]): Promise<void> {
  if (group[0]?.terminalLoad === true) return;
  const proposer = currentPlayer(group);
  if (proposer === undefined || proposer.state?.turn.phase === "finished" ||
      proposer.state?.turn.phase === "awaitingBankruptcy") return;
  const tradeDeadlineAtMs = proposer.state?.turn.deadlineAtMs;
  if (typeof tradeDeadlineAtMs === "number" && tradeDeadlineAtMs - Date.now() < 60_000) return;
  const proposerSeat = proposer.state?.seats.find((seat) =>
    seat?.playerId === proposer.admission.admission.playerId);
  if (proposerSeat?.cash === undefined || BigInt(proposerSeat.cash) < 1n) return;
  const receiver = group.find((player) => player !== proposer && proposer.state?.seats.some((seat) =>
    seat?.playerId === player.admission.admission.playerId && seat.status === "active"));
  if (receiver === undefined) return;
  const requestId = randomUUID();
  const createdVersion = await sendCommand(proposer, "createTrade", {
    tradeType: "moneyOnly",
    receiverId: receiver.admission.admission.playerId,
    offeredCash: "1",
    requestedCash: "0",
  }, requestId);
  await waitForGroupState(group, createdVersion);
  const tradeId = `trade_${requestId.replaceAll("-", "")}`;
  const acceptedVersion = await sendCommand(receiver, "acceptTrade", { tradeId });
  await waitForGroupState(group, acceptedVersion);
}

async function waitForGroupState(group: readonly LoadPlayer[], stateVersion: number): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (group.every((player) => (player.state?.stateVersion ?? -1) >= stateVersion)) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`Room state patch ${stateVersion} did not reach every connected player`);
}

async function leaveRoomForCleanup(room: Room | undefined): Promise<void> {
  if (room === undefined) return;
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      room.leave(true),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, 5_000);
      }),
    ]);
  } catch {
    // Metrics and durable reconciliation are already complete; cleanup is best-effort.
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function sendRoomCommand(
  group: LoadPlayer[],
  actor: LoadPlayer,
  type: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await waitForGroupState(group, group[0]?.state?.stateVersion ?? 0);
  const stateVersion = await sendCommand(actor, type, payload);
  await waitForGroupState(group, stateVersion);
}

function currentPlayer(group: LoadPlayer[]): LoadPlayer | undefined {
  const state = group[0]?.state;
  const seat = typeof state?.turn.currentSeatIndex === "number"
    ? state.seats[state.turn.currentSeatIndex]
    : null;
  return group.find((player) => player.admission.admission.playerId === seat?.playerId);
}

async function advanceRoom(group: LoadPlayer[]): Promise<void> {
  if (group[0]?.terminalLoad === true) return;
  const actor = currentPlayer(group);
  const turn = group[0]?.state?.turn;
  if (actor === undefined || turn === undefined || turn.phase === "finished") return;
  if (turn.phase === "awaitingRoll") return sendRoomCommand(group, actor, "rollDice");
  if (turn.phase === "awaitingPropertyDecision") {
    const actorSeat = group[0]?.state?.seats.find((seat) =>
      seat?.playerId === actor.admission.admission.playerId);
    const price = propertyPrices.get(Number(turn.propertyPosition));
    const canBuy = price !== undefined && actorSeat?.cash !== undefined && BigInt(actorSeat.cash) >= price;
    return sendRoomCommand(
      group,
      actor,
      canBuy ? "buyProperty" : "declineProperty",
      { position: turn.propertyPosition },
    );
  }
  if (turn.phase === "awaitingRentPayment") {
    return sendRoomCommand(group, actor, "payRent", { position: turn.propertyPosition });
  }
  if (turn.phase === "awaitingCardDraw") {
    return sendRoomCommand(
      group,
      actor,
      turn.deck === "chance" ? "drawChanceCard" : "drawCommunityChestCard",
    );
  }
  if (turn.phase === "awaitingTaxPayment") {
    const actorSeat = group[0]?.state?.seats.find((seat) =>
      seat?.playerId === actor.admission.admission.playerId);
    if (turn.taxKind === "priorityFee" &&
        (actorSeat?.cash === undefined || BigInt(actorSeat.cash) < 75n)) return;
    return sendRoomCommand(
      group,
      actor,
      turn.taxKind === "mev" ? "payMevTax" : "payPriorityFeeTax",
    );
  }
  if (turn.phase === "awaitingBankruptcy") return sendRoomCommand(group, actor, "declareBankruptcy");
  if (turn.phase === "awaitingEndTurn") return sendRoomCommand(group, actor, "endTurn");
}

async function reconnectBurst(groups: LoadPlayer[][]): Promise<void> {
  const selected = groups.flat().filter((player) => player.terminalLoad !== true).slice(0, Math.floor(playersCount / 4));
  await runInBatches(selected, 10, async (player) => {
    await player.room?.leave(true);
    player.admission = await mutation<Admission>(
      player,
      `/v1/game-sessions/${player.admission.session.gameId}/reconnect-ticket`,
      { contractVersion: 1 },
    );
    await connectPlayer(player);
    reconnects += 1;
  });
}

async function main(): Promise<void> {
  const players = await createPlayers();
  const groups = await admitPlayers(players);
  await runInBatches(players, 10, connectPlayer);
  await Promise.all(groups.map(async (group) => {
    const creator = group[0];
    if (creator !== undefined) {
      const stateVersion = await sendCommand(creator, "startGame");
      await waitForGroupState(group, stateVersion);
    }
  }));

  const startedAt = Date.now();
  let burstComplete = false;
  let iteration = 0;
  while (Date.now() - startedAt < durationMs) {
    const iterationStartedAt = performance.now();
    await Promise.all(groups.map(advanceRoom));
    iteration += 1;
    if (iteration % 60 === 0) await Promise.all(groups.map(exchangeMoneyTrade));
    if (!burstComplete && Date.now() - startedAt >= Math.min(durationMs / 2, 60_000)) {
      await reconnectBurst(groups);
      burstComplete = true;
    }
    const remainingIntervalMs = commandIntervalMs - (performance.now() - iterationStartedAt);
    if (remainingIntervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingIntervalMs));
    }
  }

  const metrics = await (await fetch(`${gameServerUrl.replace(/^ws/, "http")}/metrics`)).text();
  const eventLoopP99 = Number(metrics.match(/event_loop_lag_p99_milliseconds ([0-9.]+)/)?.[1] ?? "Infinity");
  const reconciliation = await pool.query(
    `SELECT count(*)::int AS count FROM economy.coin_account_reconciliation
     WHERE available_coin <> ledger_available_coin OR reserved_coin <> ledger_reserved_coin`,
  );
  const duplicateCommands = await pool.query(
    "SELECT count(*)::int AS count FROM (SELECT request_id FROM realtime.room_commands GROUP BY request_id HAVING count(*) > 1) duplicate",
  );
  const databaseVersion = await pool.query<{ version: string }>("SELECT version()");
  const checkpointStats = await pool.query(
    `SELECT count(*)::int AS count,
            COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY octet_length(private_state::text)), 0)::float8 AS p95_bytes,
            COALESCE(max(octet_length(private_state::text)), 0)::int AS max_bytes
     FROM realtime.room_checkpoints`,
  );
  const settlementStats = await pool.query(
    `SELECT count(*) FILTER (WHERE kind = 'completed')::int AS completed,
            count(*) FILTER (WHERE kind = 'aborted')::int AS aborted
     FROM economy.game_settlements`,
  );
  const databaseObservations = (await readFile(databaseCpuPath, "utf8"))
    .trim().split("\n").filter((value) => value.length > 0).map((line) => line.split(",").map(Number));
  const databaseCpuSamples = databaseObservations.map(([cpu]) => cpu).filter(Number.isFinite);
  const databaseLockWaitersMax = Math.max(0, ...databaseObservations.map(([, locks]) => locks ?? 0));
  const apiPoolConnectionsMax = Math.max(0, ...databaseObservations.map(([, , connections]) => connections ?? 0));
  const apiPoolUsagePercent = apiPoolConnectionsMax / 20 * 100;
  const minimumDatabaseCpuSamples = Math.max(3, Math.floor(durationMs / 10_000));
  const databaseCpuMax = Math.max(0, ...databaseCpuSamples);
  const databaseCpuP95 = percentile(databaseCpuSamples, 0.95);
  const durableCommands = await pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM realtime.room_commands WHERE player_id <> 'system_timer'",
  );
  const expectedDurableCommands = acknowledgements;
  const report = {
    generatedAt: new Date().toISOString(),
    provenance: {
      gitCommit,
      sourceManifestSha256,
      invocation,
      nodeVersion: process.version,
      postgresVersion: databaseVersion.rows[0]?.version ?? "unknown",
      databaseCpuCores,
    },
    players: playersCount,
    rooms: roomsCount,
    durationSeconds: Math.round((Date.now() - startedAt) / 1_000),
    configuredCommandIntervalMs: commandIntervalMs,
    acceptedCommandsPerSecond: acknowledgements / Math.max(1, (Date.now() - startedAt) / 1_000),
    acknowledgements,
    commandMix: Object.fromEntries([...commandMix.entries()].sort(([left], [right]) => left.localeCompare(right))),
    rejections,
    reconnects,
    expectedReconnects: Math.min(Math.floor(playersCount / 4), playersCount - terminalRoomsCount * 4),
    uniqueRequestIds: requestIds.size,
    duplicateDurableCommands: duplicateCommands.rows[0].count,
    durableCommands: durableCommands.rows[0].count,
    expectedDurableCommands,
    ledgerReconciliationMismatches: reconciliation.rows[0].count,
    apiJoinLatencyMs: { p95: percentile(joinLatencies, 0.95), p99: percentile(joinLatencies, 0.99) },
    commandAckLatencyMs: {
      p95: percentile(acknowledgementLatencies, 0.95),
      p99: percentile(acknowledgementLatencies, 0.99),
    },
    eventLoopLagP99Ms: eventLoopP99,
    realtimeResidentMemoryBytes: Number(metrics.match(/process_resident_memory_bytes ([0-9.]+)/)?.[1] ?? "Infinity"),
    apiPoolConnectionsMax,
    apiPoolUsagePercent,
    databaseLockWaitersMax,
    databaseCpuP95Percent: databaseCpuP95,
    databaseCpuMaxPercent: databaseCpuMax,
    databaseCpuSamples: databaseCpuSamples.length,
    checkpointPrivateStateBytes: {
      count: checkpointStats.rows[0].count,
      p95: checkpointStats.rows[0].p95_bytes,
      max: checkpointStats.rows[0].max_bytes,
    },
    settlements: {
      completed: settlementStats.rows[0].completed,
      aborted: settlementStats.rows[0].aborted,
    },
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (
    report.rejections !== 0 || report.duplicateDurableCommands !== 0 ||
    report.ledgerReconciliationMismatches !== 0 || report.commandAckLatencyMs.p95 >= 250 ||
    report.commandAckLatencyMs.p99 >= 500 || report.apiJoinLatencyMs.p95 >= 500 ||
    report.eventLoopLagP99Ms >= 100 || report.apiPoolUsagePercent >= 80 ||
    report.databaseCpuP95Percent >= 70 ||
    report.databaseCpuSamples < minimumDatabaseCpuSamples ||
    report.reconnects !== report.expectedReconnects ||
    report.durableCommands !== report.expectedDurableCommands ||
    (terminalRoomsCount > 0 && roomsCount > 1 && (report.settlements.completed < terminalRoomsCount || (report.commandMix.buyProperty ?? 0) < 1 ||
      (report.commandMix.payRent ?? 0) < 1 || (report.commandMix.acceptTrade ?? 0) < 1))
  ) throw new Error("Load gate thresholds were not met");

  await Promise.all(players.map((player) => leaveRoomForCleanup(player.room)));
}

try {
  await main();
} finally {
  await pool.end();
}
