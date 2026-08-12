import type { Room } from "@colyseus/sdk";
import { SignJWT } from "jose";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import WebSocket, { type ClientOptions } from "ws";

const apiUrl = required("RESTORE_API_URL");
const gameServerUrl = required("RESTORE_GAME_SERVER_URL");
const gameServerOrigin = required("RESTORE_GAME_SERVER_ORIGIN");
const databaseUrl = required("RESTORE_DATABASE_URL");
const accessSecret = required("RESTORE_ACCESS_SECRET");
const userId = process.env["RESTORE_USER_ID"] ?? "load_user_0000";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

class OriginWebSocket extends WebSocket {
  public constructor(address: string | URL, options: ClientOptions = {}) {
    super(address, { ...options, origin: gameServerOrigin });
  }
}

Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: OriginWebSocket });
const { Client } = await import("@colyseus/sdk");
const pool = new Pool({ connectionString: databaseUrl, max: 2 });

async function waitForState(room: Room): Promise<{ gameId: string; stateVersion: number }> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const wire = room.state as unknown as { publicStateJson?: unknown };
    if (typeof wire.publicStateJson === "string") {
      const parsed = JSON.parse(wire.publicStateJson) as { gameId?: unknown; stateVersion?: unknown };
      if (typeof parsed.gameId === "string" && Number.isSafeInteger(parsed.stateVersion)) {
        return { gameId: parsed.gameId, stateVersion: Number(parsed.stateVersion) };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Restored room did not publish canonical state");
}

async function main(): Promise<void> {
  const expected = await pool.query<{
    available_coin: string;
    game_id: string;
    reserved_coin: string;
    state_version: string;
  }>(
    `SELECT account.available_coin::text, account.reserved_coin::text,
            session.id AS game_id, checkpoint.state_version::text
     FROM economy.coin_accounts account
     JOIN game.session_players player ON player.user_id = account.user_id AND player.active = true
     JOIN game.game_sessions session ON session.id = player.game_session_id
     JOIN realtime.room_checkpoints checkpoint ON checkpoint.room_id = session.room_id
     WHERE account.user_id = $1 AND session.lifecycle = 'active'
     ORDER BY session.created_at DESC LIMIT 1`,
    [userId],
  );
  const row = expected.rows[0];
  if (row === undefined) throw new Error("Restored active session or account is missing");

  const token = await new SignJWT({ sid: "restore_session" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("pootown-api").setAudience("pootown-web").setSubject(userId)
    .setIssuedAt().setExpirationTime("15m")
    .sign(new TextEncoder().encode(accessSecret));
  const headers = {
    accept: "application/json",
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "idempotency-key": randomUUID(),
    "x-contract-version": "1",
  };
  const balanceResponse = await fetch(`${apiUrl}/v1/me/coins`, { headers });
  if (!balanceResponse.ok) throw new Error(`Restored balance endpoint failed with ${balanceResponse.status}`);
  const balance = await balanceResponse.json() as { availableCoin?: unknown; reservedCoin?: unknown };
  if (balance.availableCoin !== row.available_coin || balance.reservedCoin !== row.reserved_coin) {
    throw new Error("Restored API balance does not match restored ledger account");
  }

  const admissionResponse = await fetch(`${apiUrl}/v1/game-sessions/${row.game_id}/reconnect-ticket`, {
    method: "POST",
    headers,
    body: JSON.stringify({ contractVersion: 1 }),
  });
  if (!admissionResponse.ok) {
    throw new Error(`Restored reconnect ticket failed with ${admissionResponse.status}`);
  }
  const admission = await admissionResponse.json() as {
    admission?: { ticket?: unknown };
    session?: { gameId?: unknown };
  };
  if (admission.session?.gameId !== row.game_id || typeof admission.admission?.ticket !== "string") {
    throw new Error("Restored reconnect admission is malformed");
  }

  const client = new Client(gameServerUrl);
  const room = await client.joinOrCreate("game", {
    contractVersion: 1,
    gameId: row.game_id,
    ticket: admission.admission.ticket,
  });
  try {
    room.onMessage("domain.event", () => undefined);
    room.onMessage("player.private", () => undefined);
    room.onMessage("session.status", () => undefined);
    const state = await waitForState(room);
    if (state.gameId !== row.game_id || state.stateVersion !== Number(row.state_version)) {
      throw new Error("Restored realtime state does not match the durable checkpoint");
    }
    process.stdout.write(`${JSON.stringify({
      availableCoin: row.available_coin,
      gameId: row.game_id,
      reservedCoin: row.reserved_coin,
      restoredStateVersion: state.stateVersion,
    })}\n`);
  } finally {
    await room.leave(true).catch(() => undefined);
  }
}

await main().finally(() => pool.end());
