import type { SessionDetail } from "@pootown/game-contracts";

export type SettlementStatus = "completed" | "delayed" | "processing";

export function settlementStatusFromLifecycle(
  lifecycle: SessionDetail["lifecycle"],
): SettlementStatus {
  if (lifecycle === "settled") return "completed";
  if (lifecycle === "recoveryRequired") return "delayed";
  return "processing";
}
