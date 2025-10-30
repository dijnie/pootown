"use client";

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { Address, isSome } from "@solana/kit";
import { GameEvent } from "@/lib/sdk/types";
import { useGameEvents } from "@/hooks/useGameEvents";
import { useWallet } from "@/hooks/use-wallet";
import { playSound } from "@/lib/soundUtil";
import { useGameContext } from "./game-provider";
import {
  // showTaxPaidToast,
  // showPlayerPassedGoToast,
  // showPlayerJoinedToast,
  // showGameStartedToast,
  // showChanceCardDrawnToast,
  // showCommunityChestCardDrawnToast,
  // showGoToJailToast,
  // showPropertyPurchasedToast,
  showGameEndedToast,
} from "@/lib/toast-utils";
import { getBoardSpaceData } from "@/lib/board-utils";

type EventHandler<T = any> = (event: T, context: GameEventContext) => void;

interface GameEventContext {
  signature: string;
  gameAddress: Address | null;
  currentPlayerAddress: string | null;
  isCurrentPlayer: (playerAddress: Address) => boolean;
}

interface GameEventsContextType {
  isSubscribed: boolean;
  lastEvent: GameEvent | null;
  eventHistory: GameEvent[];

  registerEventHandler: <T extends GameEvent["type"]>(
    eventType: T,
    handler: EventHandler<Extract<GameEvent, { type: T }>["data"]>
  ) => () => void;

  clearEventHistory: () => void;
}

const GameEventsContext = createContext<GameEventsContextType | null>(null);

export const useGameEventsContext = () => {
  const context = useContext(GameEventsContext);
  if (!context) {
    throw new Error(
      "useGameEventsContext must be used within GameEventsProvider"
    );
  }
  return context;
};

interface GameEventsProviderProps {
  children: ReactNode;
}

export const GameEventsProvider: React.FC<GameEventsProviderProps> = ({
  children,
}) => {
  const { gameAddress, gameState } = useGameContext();
  const { wallet } = useWallet();
  const [eventHandlers, setEventHandlers] = useState<
    Map<string, Set<EventHandler>>
  >(new Map());
  const [lastEvent, setLastEvent] = useState<GameEvent | null>(null);
  const [eventHistory, setEventHistory] = useState<GameEvent[]>([]);

  const { isSubscribed } = useGameEvents(gameAddress, {
    gameData: gameState,
    onEvent: useCallback(
      (event: GameEvent) => {
        console.log("GameEventsProvider received event:", event);
        setLastEvent(event);
        setEventHistory((prev) => [...prev, event].slice(-100)); // Keep last 100 events

        const handlers = eventHandlers.get(event.type);

        if (handlers) {
          const context: GameEventContext = {
            gameAddress: gameAddress || null,
            currentPlayerAddress: wallet?.address || null,
            isCurrentPlayer: (playerAddress: Address) =>
              wallet?.address === playerAddress.toString(),
            signature: event.signature,
          };

          handlers.forEach((handler) => {
            try {
              handler(event.data, context);
            } catch (error) {
              console.error(`Error in event handler for ${event.type}:`, error);
            }
          });
        }
      },
      [eventHandlers, gameAddress, wallet?.address]
    ),
  });

  const registerEventHandler = useCallback(
    <T extends GameEvent["type"]>(
      eventType: T,
      handler: EventHandler<Extract<GameEvent, { type: T }>["data"]>
    ) => {
      setEventHandlers((prev) => {
        const newMap = new Map(prev);
        if (!newMap.has(eventType)) {
          newMap.set(eventType, new Set());
        }
        newMap.get(eventType)!.add(handler as EventHandler);
        return newMap;
      });

      return () => {
        setEventHandlers((prev) => {
          const newMap = new Map(prev);
          const handlers = newMap.get(eventType);
          if (handlers) {
            handlers.delete(handler as EventHandler);
            if (handlers.size === 0) {
              newMap.delete(eventType);
            }
          }
          return newMap;
        });
      };
    },
    []
  );

  const clearEventHistory = useCallback(() => {
    setEventHistory([]);
    setLastEvent(null);
  }, []);

  useEffect(() => {
    const unsubscribeTaxPaid = registerEventHandler(
      "TaxPaid",
      (data, context) => {
        // showTaxPaidToast({
        //   isCurrentPlayer: context.isCurrentPlayer(data.player),
        //   playerAddress: data.player.toString(),
        //   taxType: data.taxType,
        //   amount: data.amount,
        //   position: data.position,
        // });

        // Play money pay sound for tax
        if (context.isCurrentPlayer(data.player)) {
          playSound("money-pay", 0.6);
        }
      }
    );

    const unsubscribePlayerPassedGo = registerEventHandler(
      "PlayerPassedGo",
      (data, context) => {
        if (context.isCurrentPlayer(data.player)) {
          // showPlayerPassedGoToast({
          //   salaryCollected: data.salaryCollected,
          // });

          playSound("money-receive");
        }
      }
    );

    const unsubscribePlayerJoined = registerEventHandler(
      "PlayerJoined",
      (data, context) => {
        // Show toast for everyone except the player who joined
        // if (!context.isCurrentPlayer(data.player)) {
        //   showPlayerJoinedToast({
        //     playerAddress: data.player,
        //     playerIndex: data.playerIndex,
        //     totalPlayers: data.totalPlayers,
        //   });
        // }

        // Play sound for ALL players in lobby (including the one who joined)
        playSound("player-join", 0.5);
      }
    );

    const unsubscribeGameStarted = registerEventHandler(
      "GameStarted",
      (data) => {
        // showGameStartedToast({
        //   totalPlayers: data.totalPlayers,
        //   firstPlayer: data.firstPlayer,
        // });

        // Play game start sound for all players
        playSound("game-start", 0.4);
      }
    );

    const unsubscribeChanceCard = registerEventHandler(
      "ChanceCardDrawn",
      (data, context) => {
        if (!context.isCurrentPlayer(data.player)) {
          // showChanceCardDrawnToast({
          //   playerAddress: data.player,
          //   cardIndex: data.cardIndex,
          //   isCurrentPlayer: context.isCurrentPlayer(data.player),
          // });
        }
      }
    );

    const unsubscribeCommunityChestCard = registerEventHandler(
      "CommunityChestCardDrawn",
      (data, context) => {
        if (!context.isCurrentPlayer(data.player)) {
          // showCommunityChestCardDrawnToast({
          //   playerAddress: data.player,
          //   cardIndex: data.cardIndex,
          //   isCurrentPlayer: context.isCurrentPlayer(data.player),
          // });
        }
      }
    );

    const unsubscribeSpecialSpaceAction = registerEventHandler(
      "SpecialSpaceAction",
      (data, context) => {
        if (data.spaceType === 2) {
          // showGoToJailToast({
          //   playerAddress: data.player,
          //   isCurrentPlayer: context.isCurrentPlayer(data.player),
          // });

          // Play jail sound for all players
          playSound("jail", 0.7);
        }
      }
    );

    const unsubscribePropertyPurchased = registerEventHandler(
      "PropertyPurchased",
      (data, context) => {
        const propertyData = getBoardSpaceData(data.propertyPosition);
        const propertyName =
          propertyData?.name || `Property ${data.propertyPosition}`;

        const isCurrentPlayer = context.isCurrentPlayer(data.player);

        // showPropertyPurchasedToast({
        //   propertyName,
        //   price: data.price,
        //   isCurrentPlayer,
        //   playerAddress: isCurrentPlayer ? undefined : data.player,
        // });

        // Play property buy sound for all players
        if (!isCurrentPlayer) {
          playSound("property-buy", 0.3);
        }
      }
    );

    const unsubscribeRentPaid = registerEventHandler(
      "RentPaid",
      (data, context) => {
        // Play rent payment sound for payer
        if (context.isCurrentPlayer(data.payer)) {
          playSound("money-pay", 0.6);
        }
        // Play money receive sound for owner
        else if (context.isCurrentPlayer(data.owner)) {
          playSound("money-receive", 0.6);
        }
      }
    );

    const unsubscribeHouseBuilt = registerEventHandler(
      "HouseBuilt",
      (data, context) => {
        // Play house build sound for all players
        if (!context.isCurrentPlayer(data.player)) {
          playSound("house-build", 0.4);
        }
      }
    );

    const unsubscribeHotelBuilt = registerEventHandler(
      "HotelBuilt",
      (data, context) => {
        // Play hotel build sound for all players
        if (!context.isCurrentPlayer(data.player)) {
          playSound("hotel-build", 0.4);
        }
      }
    );

    const unsubscribeBuildingSold = registerEventHandler(
      "BuildingSold",
      (data, context) => {
        // Play building sell sound for all players
        if (!context.isCurrentPlayer(data.player)) {
          playSound("building-sell", 0.4);
        }
      }
    );

    const unsubscribePlayerBankrupt = registerEventHandler(
      "PlayerBankrupt",
      (data, context) => {
        // Play lose sound when a player goes bankrupt
        if (context.isCurrentPlayer(data.player)) {
          playSound("lose", 0.8);
        } else {
          // Other players hear a lighter sound
          playSound("bruh", 0.3);
        }
      }
    );

    const unsubscribeGameEnded = registerEventHandler(
      "GameEnded",
      (data, context) => {
        const winner = isSome(data.winner) ? data.winner.value : null;

        showGameEndedToast({
          winner,
          reason: data.reason,
          winnerNetWorth: Number(data.winnerNetWorth),
          currentPlayerAddress: context.currentPlayerAddress,
        });

        const isWinner =
          winner &&
          context.currentPlayerAddress &&
          winner === context.currentPlayerAddress;
        playSound(isWinner ? "money-receive" : "button-click");
      }
    );

    return () => {
      unsubscribeTaxPaid();
      unsubscribePlayerPassedGo();
      unsubscribePlayerJoined();
      unsubscribeGameStarted();
      unsubscribeChanceCard();
      unsubscribeCommunityChestCard();
      unsubscribeSpecialSpaceAction();
      unsubscribePropertyPurchased();
      unsubscribeRentPaid();
      unsubscribeHouseBuilt();
      unsubscribeHotelBuilt();
      unsubscribeBuildingSold();
      unsubscribePlayerBankrupt();
      unsubscribeGameEnded();
    };
  }, [registerEventHandler]);

  const contextValue: GameEventsContextType = {
    isSubscribed,
    lastEvent,
    eventHistory,
    // @ts-expect-error
    registerEventHandler,
    clearEventHistory,
  };

  return (
    <GameEventsContext.Provider value={contextValue}>
      {children}
    </GameEventsContext.Provider>
  );
};
