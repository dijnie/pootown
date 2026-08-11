import { createHash } from "node:crypto";

export function sessionFinalizationIdempotencyKey(
  gameId: string,
  roomId: string,
  playerId: string,
  requestId: string,
  action: "leave" | "cancel",
): string {
  return `realtime-finalize-${createHash("sha256")
    .update(`${gameId}\0${roomId}\0${playerId}\0${requestId}\0${action}`)
    .digest("hex")}`;
}
