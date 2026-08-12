import type { AdmissionResponse } from "@pootown/game-contracts";

import type { GameRoomClient, RoomPublicState } from "./game-room-client.js";

export async function openRoomConnection(
  client: Pick<GameRoomClient, "connect" | "disconnect">,
  admission: AdmissionResponse,
  replaceExisting: boolean
): Promise<RoomPublicState> {
  if (replaceExisting) await client.disconnect();
  return client.connect({
    contractVersion: admission.contractVersion,
    gameId: admission.session.gameId,
    ticket: admission.admission.ticket,
  });
}
