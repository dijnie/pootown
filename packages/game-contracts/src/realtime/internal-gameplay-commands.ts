import { z } from "zod";

import { RequestIdSchema, StateVersionSchema } from "../primitives";
import { CardDeckSchema } from "../state/gameplay-state";

const commandEnvelope = {
  requestId: RequestIdSchema,
  expectedStateVersion: StateVersionSchema,
};

const emptyInternalCommand = <TType extends string>(type: TType) =>
  z.strictObject({ ...commandEnvelope, type: z.literal(type), payload: z.strictObject({}) });

export const ResolveRandomDiceCommandSchema = emptyInternalCommand("resolveRandomDice");
export const ResolveRandomCardCommandSchema = z.strictObject({
  ...commandEnvelope,
  type: z.literal("resolveRandomCard"),
  payload: z.strictObject({ deck: CardDeckSchema }),
});
export const WarnTurnThirtySecondsCommandSchema = emptyInternalCommand("warnTurnThirtySeconds");
export const WarnTurnTenSecondsCommandSchema = emptyInternalCommand("warnTurnTenSeconds");
export const HandleTurnTimeoutCommandSchema = emptyInternalCommand("handleTurnTimeout");
export const CleanupExpiredTradesCommandSchema = emptyInternalCommand("cleanupExpiredTrades");
export const EnforceGameTimeLimitCommandSchema = emptyInternalCommand("enforceGameTimeLimit");

export const InternalGameplayCommandSchema = z.discriminatedUnion("type", [
  ResolveRandomDiceCommandSchema,
  ResolveRandomCardCommandSchema,
  WarnTurnThirtySecondsCommandSchema,
  WarnTurnTenSecondsCommandSchema,
  HandleTurnTimeoutCommandSchema,
  CleanupExpiredTradesCommandSchema,
  EnforceGameTimeLimitCommandSchema,
]);

export type InternalGameplayCommand = z.infer<typeof InternalGameplayCommandSchema>;
