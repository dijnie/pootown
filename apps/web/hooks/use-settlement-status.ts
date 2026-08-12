"use client";

import { useEffect, useState } from "react";
import { GameIdSchema } from "@pootown/game-contracts";

import { useApi } from "@/components/providers/api-provider";
import {
  settlementStatusFromLifecycle,
  type SettlementStatus,
} from "@/services/settlement-status";

export function useSettlementStatus(
  gameId: string | null,
  enabled: boolean,
  roomReportsSettled: boolean,
): SettlementStatus {
  const { sessions } = useApi();
  const [status, setStatus] = useState<SettlementStatus>(
    roomReportsSettled ? "completed" : "processing",
  );

  useEffect(() => {
    if (!enabled) {
      setStatus("processing");
      return;
    }
    if (roomReportsSettled) {
      setStatus("completed");
      return;
    }

    const parsedGameId = GameIdSchema.safeParse(gameId);
    if (!parsedGameId.success) {
      setStatus("delayed");
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async (): Promise<void> => {
      try {
        const session = await sessions.detail(parsedGameId.data);
        if (!active) return;
        const nextStatus = settlementStatusFromLifecycle(session.lifecycle);
        setStatus(nextStatus);
        if (nextStatus === "completed") return;
      } catch {
        if (!active) return;
        setStatus("delayed");
      }
      timer = setTimeout(() => void poll(), document.hidden ? 10_000 : 3_000);
    };

    void poll();
    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [enabled, gameId, roomReportsSettled, sessions]);

  return status;
}
