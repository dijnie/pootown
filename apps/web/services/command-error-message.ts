import { CommandRejectedError, RoomTransportError } from "./game-room-client";

export function commandErrorMessage(error: unknown): string {
  if (error instanceof CommandRejectedError) {
    switch (error.rejection.code) {
      case "STALE_STATE_VERSION":
        return "The game changed before that action completed. Review the latest state and try again.";
      case "UNAUTHORIZED_ACTOR":
        return "That action is not available to this player.";
      case "INVALID_PHASE":
        return "That action is no longer available in the current turn.";
      default:
        return "The action could not be completed. The latest game state is still authoritative.";
    }
  }
  if (
    error instanceof RoomTransportError ||
    (error instanceof Error && /connect|room/i.test(error.message))
  ) {
    return "The game connection was interrupted. Reconnect and try again.";
  }
  return "The action could not be completed. Please try again.";
}
