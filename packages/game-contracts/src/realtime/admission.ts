import { z } from "zod";

import {
  ContractVersionSchema,
  GameIdSchema,
  RealtimeTicketSchema,
} from "../primitives";

export const RoomAdmissionOptionsSchema = z.strictObject({
  contractVersion: ContractVersionSchema,
  gameId: GameIdSchema,
  ticket: RealtimeTicketSchema,
});

export type RoomAdmissionOptions = z.infer<typeof RoomAdmissionOptionsSchema>;
