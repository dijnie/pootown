"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { mapRoomEventToLog } from "@/services/room-event-to-log";
import type { GameLogEntry } from "@/types/space-types";

import { useGameEventsContext } from "./game-events-provider";
import { useGameContext } from "./game-provider";

interface GameLogsContextType {
  readonly gameLogs: readonly GameLogEntry[];
}

const GameLogsContext = createContext<GameLogsContextType | null>(null);

export function useGameLogs(): GameLogsContextType {
  const context = useContext(GameLogsContext);
  if (context === null)
    throw new Error("useGameLogs must be used within GameLogsProvider");
  return context;
}

export function GameLogsProvider({
  children,
  maxLogs = 100,
}: {
  readonly children: ReactNode;
  readonly maxLogs?: number;
}) {
  const { gameId } = useGameContext();
  const { eventHistory } = useGameEventsContext();
  const [gameLogs, setGameLogs] = useState<GameLogEntry[]>([]);
  const loggedEventIds = useRef(new Set<string>());

  useEffect(() => {
    loggedEventIds.current.clear();
    setGameLogs([]);
  }, [gameId]);

  useEffect(() => {
    if (gameId === null) return;
    const entries: GameLogEntry[] = [];
    for (const event of eventHistory) {
      if (loggedEventIds.current.has(event.eventId)) continue;
      loggedEventIds.current.add(event.eventId);
      const entry = mapRoomEventToLog(event.payload, gameId, event.eventId);
      if (entry !== null) {
        entries.push({
          ...entry,
          id: event.eventId,
          timestamp: event.occurredAtMs,
        });
      }
    }
    if (entries.length === 0) return;
    setGameLogs((current) =>
      [...entries.reverse(), ...current].slice(0, maxLogs)
    );
  }, [eventHistory, gameId, maxLogs]);

  return (
    <GameLogsContext.Provider value={{ gameLogs }}>
      {children}
    </GameLogsContext.Provider>
  );
}
