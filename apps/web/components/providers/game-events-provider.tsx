"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  GameplayEventPayload,
  LifecycleEventPayload,
  ServerMessage,
} from "@pootown/game-contracts";

import { useRoom } from "@/components/providers/room-provider";
import { playSound } from "@/lib/soundUtil";
import { showGameEndedToast } from "@/lib/toast-utils";

type DomainPayload = GameplayEventPayload | LifecycleEventPayload;
type DomainMessage = Extract<ServerMessage, { type: "domain.event" }>;
type PayloadType = DomainPayload["type"];

interface GameEventContext {
  readonly currentPlayerId: string | null;
  readonly eventId: string;
  readonly isCurrentPlayer: (playerId: string) => boolean;
}

type TypedHandler<TType extends PayloadType> = (
  event: Extract<DomainPayload, { type: TType }>,
  context: GameEventContext
) => void;
type StoredHandler = (event: DomainPayload, context: GameEventContext) => void;

interface GameEventsContextType {
  readonly isSubscribed: boolean;
  readonly lastEvent: DomainMessage | null;
  readonly eventHistory: readonly DomainMessage[];
  readonly registerEventHandler: <TType extends PayloadType>(
    eventType: TType,
    handler: TypedHandler<TType>
  ) => () => void;
  readonly clearEventHistory: () => void;
}

const GameEventsContext = createContext<GameEventsContextType | null>(null);

export function useGameEventsContext(): GameEventsContextType {
  const context = useContext(GameEventsContext);
  if (context === null)
    throw new Error(
      "useGameEventsContext must be used within GameEventsProvider"
    );
  return context;
}

function isDomainMessage(message: ServerMessage): message is DomainMessage {
  return message?.type === "domain.event";
}

export function GameEventsProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const room = useRoom();
  const handlers = useRef(new Map<PayloadType, Set<StoredHandler>>());
  const seenEventIds = useRef(new Set<string>());
  const activeGameId = useRef<string | null>(null);
  const [lastEvent, setLastEvent] = useState<DomainMessage | null>(null);
  const [eventHistory, setEventHistory] = useState<DomainMessage[]>([]);

  const registerEventHandler = useCallback(
    <TType extends PayloadType>(
      eventType: TType,
      handler: TypedHandler<TType>
    ) => {
      const stored: StoredHandler = (event, context) => {
        if (event.type === eventType)
          handler(event as Extract<DomainPayload, { type: TType }>, context);
      };
      const typeHandlers =
        handlers.current.get(eventType) ?? new Set<StoredHandler>();
      typeHandlers.add(stored);
      handlers.current.set(eventType, typeHandlers);
      return () => {
        typeHandlers.delete(stored);
        if (typeHandlers.size === 0) handlers.current.delete(eventType);
      };
    },
    []
  );

  useEffect(() => {
    const nextGameId = room.state?.gameId ?? null;
    if (activeGameId.current === nextGameId) return;
    activeGameId.current = nextGameId;
    seenEventIds.current.clear();
    setLastEvent(null);
    setEventHistory([]);
  }, [room.state?.gameId]);

  useEffect(() => {
    const events = room.messages
      .filter(isDomainMessage)
      .filter((event) => !seenEventIds.current.has(event.eventId));
    if (events.length === 0) return;
    for (const event of events) {
      seenEventIds.current.add(event.eventId);
      const context: GameEventContext = {
        currentPlayerId: room.playerId,
        eventId: event.eventId,
        isCurrentPlayer: (playerId) => playerId === room.playerId,
      };
      for (const handler of handlers.current.get(event.payload.type) ?? []) {
        try {
          handler(event.payload, context);
        } catch {
          // UI effects cannot alter authoritative room state or event delivery.
        }
      }
      const payload = event.payload;
      if (payload.type === "playerJoined") playSound("player-join", 0.5);
      if (payload.type === "gameStarted") playSound("game-start", 0.4);
      if (payload.type === "jailEntered") playSound("jail", 0.7);
      if (payload.type === "propertyPurchased") playSound("property-buy", 0.3);
      if (payload.type === "buildingBuilt")
        playSound(
          payload.buildingType === "hotel" ? "hotel-build" : "house-build",
          0.4
        );
      if (payload.type === "buildingSold") playSound("building-sell", 0.4);
      if (payload.type === "rentPaid") {
        if (context.isCurrentPlayer(payload.payerId))
          playSound("money-pay", 0.6);
        if (context.isCurrentPlayer(payload.ownerId))
          playSound("money-receive", 0.6);
      }
      if (payload.type === "playerBankrupt")
        playSound(
          context.isCurrentPlayer(payload.playerId) ? "lose" : "bruh",
          0.4
        );
      if (payload.type === "gameEnded") {
        const winner = payload.winnerId;
        showGameEndedToast({
          winner,
          reason: payload.reason === "timeLimit" ? 1 : 0,
          winnerNetWorth: payload.ranking[0]?.netWorth ?? "0",
          currentPlayerId: room.playerId,
        });
        playSound(
          context.isCurrentPlayer(winner) ? "money-receive" : "button-click"
        );
      }
    }
    setLastEvent(events.at(-1) ?? null);
    setEventHistory((history) => [...history, ...events].slice(-100));
  }, [room.messages, room.playerId]);

  const clearEventHistory = useCallback(() => {
    setLastEvent(null);
    setEventHistory([]);
    seenEventIds.current.clear();
  }, []);

  const value = useMemo<GameEventsContextType>(
    () => ({
      isSubscribed: room.status === "connected",
      lastEvent,
      eventHistory,
      registerEventHandler,
      clearEventHistory,
    }),
    [
      clearEventHistory,
      eventHistory,
      lastEvent,
      registerEventHandler,
      room.status,
    ]
  );

  return (
    <GameEventsContext.Provider value={value}>
      {children}
    </GameEventsContext.Provider>
  );
}
