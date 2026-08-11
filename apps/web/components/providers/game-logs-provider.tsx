"use client";

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { GameLogEntry } from "@/types/space-types";
import { useGameEventsContext } from "./game-events-provider";
import { mapEventToLogEntry } from "@/lib/event-to-log-mapper";
import { GameEvent } from "@/lib/sdk/types";
import { useGameContext } from "./game-provider";

interface GameLogsContextType {
  gameLogs: GameLogEntry[];
  addGameLog: (entry: Omit<GameLogEntry, "id" | "timestamp">) => void;
  clearLogs: () => void;
  refreshLogs: () => GameLogEntry[];
  removeDuplicates: () => void;
}

const GameLogsContext = createContext<GameLogsContextType | null>(null);

export const useGameLogs = () => {
  const context = useContext(GameLogsContext);
  if (!context) {
    throw new Error("useGameLogsContext must be used within GameLogsProvider");
  }
  return context;
};

interface GameLogsProviderProps {
  children: ReactNode;
  maxLogs?: number;
  persistToStorage?: boolean;
}

export const GameLogsProvider: React.FC<GameLogsProviderProps> = ({
  children,
  maxLogs = 100,
  persistToStorage = true,
}) => {
  const { gameAddress } = useGameContext();
  const [gameLogs, setGameLogs] = useState<GameLogEntry[]>([]);
  const { registerEventHandler } = useGameEventsContext();

  const storageKey = gameAddress
    ? `gameLogs:${gameAddress.toString()}`
    : "gameLogs:global";

  const loadLogs = useCallback(() => {
    if (!persistToStorage) return [];

    try {
      const stored = localStorage.getItem(storageKey);
      const logs = stored ? (JSON.parse(stored) as GameLogEntry[]) : [];

      // Remove duplicates when loading from storage
      const seenSignatures = new Set<string>();
      const deduplicatedLogs = logs.filter((log) => {
        const signature = log.signature;
        if (!signature) return true; // Keep logs without signature

        if (seenSignatures.has(signature)) {
          return false; // Remove duplicate
        }

        seenSignatures.add(signature);
        return true; // Keep first occurrence
      });

      // Save back to storage if duplicates were found
      if (deduplicatedLogs.length !== logs.length) {
        console.log(
          `Removed ${
            logs.length - deduplicatedLogs.length
          } duplicate logs during load`
        );
        localStorage.setItem(storageKey, JSON.stringify(deduplicatedLogs));
      }

      setGameLogs(deduplicatedLogs);
      return deduplicatedLogs;
    } catch {
      setGameLogs([]);
      return [];
    }
  }, [storageKey, persistToStorage]);

  const saveLogs = useCallback(
    (logs: GameLogEntry[]) => {
      if (!persistToStorage) return;

      try {
        localStorage.setItem(storageKey, JSON.stringify(logs));
      } catch (error) {
        console.error("Failed to save logs to localStorage:", error);
      }
    },
    [storageKey, persistToStorage]
  );

  const addGameLog = useCallback(
    (entry: Omit<GameLogEntry, "id" | "timestamp">) => {
      const newLog: GameLogEntry = {
        ...entry,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      };

      setGameLogs((currentLogs) => {
        // Check for duplicate signature to prevent duplicate logs
        const signature = newLog.signature;
        if (signature) {
          const isDuplicate = currentLogs.some(
            (log) => log.signature === signature
          );
          if (isDuplicate) {
            console.log(`Duplicate log detected for signature: ${signature}`);
            return currentLogs; // Don't add duplicate
          }
        }

        const updatedLogs = [newLog, ...currentLogs].slice(0, maxLogs);
        saveLogs(updatedLogs);
        return updatedLogs;
      });
    },
    [maxLogs, saveLogs]
  );

  const clearLogs = useCallback(() => {
    setGameLogs([]);
    if (persistToStorage) {
      localStorage.removeItem(storageKey);
    }
  }, [storageKey, persistToStorage]);

  const removeDuplicates = useCallback(() => {
    setGameLogs((currentLogs) => {
      const seenSignatures = new Set<string>();
      const deduplicatedLogs = currentLogs.filter((log) => {
        const signature = log.signature;
        if (!signature) return true; // Keep logs without signature

        if (seenSignatures.has(signature)) {
          return false; // Remove duplicate
        }

        seenSignatures.add(signature);
        return true; // Keep first occurrence
      });

      if (deduplicatedLogs.length !== currentLogs.length) {
        console.log(
          `Removed ${
            currentLogs.length - deduplicatedLogs.length
          } duplicate logs`
        );
        saveLogs(deduplicatedLogs);
      }

      return deduplicatedLogs;
    });
  }, [saveLogs]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    if (!persistToStorage) return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === storageKey) {
        loadLogs();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [storageKey, loadLogs, persistToStorage]);

  useEffect(() => {
    const unsubscribeHandlers: (() => void)[] = [];

    const eventTypes = [
      "PlayerJoined",
      "PlayerLeft",
      "GameStarted",
      "GameCancelled",
      "PlayerPassedGo",
      "PropertyPurchased",
      "PropertyDeclined",
      "RentPaid",
      "ChanceCardDrawn",
      "CommunityChestCardDrawn",
      "HouseBuilt",
      "HotelBuilt",
      "BuildingSold",
      "PropertyMortgaged",
      "PropertyUnmortgaged",
      "TaxPaid",
      "SpecialSpaceAction",
      "TradeCreated",
      "TradeAccepted",
      "TradeRejected",
      "TradeCancelled",
      "TradesCleanedUp",
      "PlayerBankrupt",
      "GameEnded",
      // "GameEndConditionMet",
      "PrizeClaimed",
    ] as const;

    eventTypes.forEach((eventType) => {
      const unsubscribe = registerEventHandler(
        eventType as GameEvent["type"],
        (eventData, context) => {
          try {
            const fullEvent = {
              type: eventType,
              data: eventData,
              signature: context.signature,
            } as GameEvent;

            const logEntry = mapEventToLogEntry(fullEvent);

            addGameLog({
              gameId: logEntry.gameId,
              type: logEntry.type,
              playerId: logEntry.playerId,
              playerName: logEntry.playerName,
              details: logEntry.details,
              signature: logEntry.signature,
            });
          } catch (error) {
            console.error(
              `Error processing ${eventType} event for logs:`,
              error
            );
          }
        }
      );

      unsubscribeHandlers.push(unsubscribe);
    });

    return () => {
      unsubscribeHandlers.forEach((unsubscribe) => unsubscribe());
    };
  }, [registerEventHandler, addGameLog]);

  const contextValue: GameLogsContextType = {
    gameLogs,
    addGameLog,
    clearLogs,
    refreshLogs: loadLogs,
    removeDuplicates,
  };

  return (
    <GameLogsContext.Provider value={contextValue}>
      {children}
    </GameLogsContext.Provider>
  );
};
