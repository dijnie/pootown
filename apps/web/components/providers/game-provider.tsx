"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  RoomCommandSchema,
  type RoomCommand,
} from "@pootown/game-contracts";

import { useRoom } from "@/components/providers/room-provider";
import { BuildingType, GameStatus } from "@/types/schema";
import { adaptRoomState } from "@/services/room-state-adapter";
import type {
  GameAccount,
  PlayerAccount,
  PropertyAccount,
  TradeOffer,
} from "@/types/schema";

interface GameContextType {
  gameAddress: string | null;
  setGameAddress: (address: string | null) => void;
  currentPlayerAddress: string | null;
  currentPlayerState: PlayerAccount | null;
  ownPlayerId: string | null;
  gameState: GameAccount | null;
  players: PlayerAccount[];
  properties: PropertyAccount[];
  gameLoading: boolean;
  gameError: Error | null;
  refetch: () => Promise<void>;
  startGame: () => Promise<void>;
  resetGame: () => Promise<void>;
  closeGame: () => Promise<void>;
  joinGame: () => Promise<void>;
  leaveGame: () => Promise<void>;
  cancelGame: () => Promise<void>;
  rollDice: (diceRoll?: number[]) => Promise<void>;
  buyProperty: (position: number) => Promise<void>;
  skipProperty: (position: number) => Promise<void>;
  payRent: (position: number, owner: string) => Promise<void>;
  endTurn: () => Promise<void>;
  drawChanceCard: () => Promise<void>;
  drawCommunityChestCard: () => Promise<void>;
  payJailFine: () => Promise<void>;
  useGetOutOfJailCard: () => Promise<void>;
  buildHouse: (position: number) => Promise<void>;
  buildHotel: (position: number) => Promise<void>;
  sellBuilding: (position: number, buildingType: BuildingType) => Promise<void>;
  payMevTax: () => Promise<void>;
  payPriorityFeeTax: () => Promise<void>;
  declareBankruptcy: () => Promise<void>;
  endGame: () => Promise<void>;
  createTrade: (receiver: string, initiatorOffer: TradeOffer, targetOffer: TradeOffer) => Promise<void>;
  acceptTrade: (tradeId: string, proposer: string) => Promise<void>;
  rejectTrade: (tradeId: string) => Promise<void>;
  cancelTrade: (tradeId: string) => Promise<void>;
  selectedProperty: number | null;
  setSelectedProperty: (position: number | null) => void;
  isPropertyDialogOpen: boolean;
  setIsPropertyDialogOpen: (open: boolean) => void;
  isCardDrawModalOpen: boolean;
  setIsCardDrawModalOpen: (open: boolean) => void;
  cardDrawType: "chance" | "community-chest" | null;
  setCardDrawType: (type: "chance" | "community-chest" | null) => void;
  isCurrentTurn: boolean;
  showRollDice: boolean;
  showEndTurn: boolean;
  showPayJailFine: boolean;
  showGetOutOfJailCard: boolean;
  getPropertyByPosition: (position: number) => PropertyAccount | null;
  getPlayerByAddress: (address: string) => PlayerAccount | null;
  isCurrentPlayerTurn: () => boolean;
  canRollDice: () => boolean;
  canPlayerAct: () => boolean;
  demoDices: number[] | null;
  setDemoDices: (dices: number[] | null) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export function useGameContext(): GameContextType {
  const context = useContext(GameContext);
  if (context === undefined) throw new Error("useGameContext must be used within GameProvider");
  return context;
}

function unsupported(action: string): Promise<never> {
  return Promise.reject(new Error(`${action} is not available in authoritative rooms`));
}

export function GameProvider({ children }: { readonly children: ReactNode }) {
  const room = useRoom();
  const [gameAddress, setGameAddress] = useState<string | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<number | null>(null);
  const [isPropertyDialogOpen, setIsPropertyDialogOpen] = useState(false);
  const [isCardDrawModalOpen, setIsCardDrawModalOpen] = useState(false);
  const [cardDrawType, setCardDrawType] = useState<"chance" | "community-chest" | null>(null);
  const [demoDices, setDemoDices] = useState<number[] | null>(null);

  const adapted = useMemo(() => room.state === null ? null : adaptRoomState(room.state), [room.state]);
  const gameState = adapted?.gameState ?? null;
  const players = useMemo(() => adapted?.players ?? [], [adapted]);
  const properties = useMemo(() => adapted?.properties ?? [], [adapted]);
  const currentPlayerAddress = useMemo(() => {
    if (room.state === null || room.state.turn.phase === "notStarted" || room.state.turn.phase === "finished") {
      return null;
    }
    return room.state.seats[room.state.turn.currentSeatIndex]?.playerId ?? null;
  }, [room.state]);
  const currentPlayerState = players.find((player) => player.wallet === currentPlayerAddress) ?? null;
  const ownPlayerState = players.find((player) => player.wallet === room.playerId) ?? null;
  const isCurrentTurn = room.playerId !== null && currentPlayerAddress === room.playerId &&
    gameState?.gameStatus === GameStatus.InProgress;

  const sendIntent = useCallback(async (type: RoomCommand["type"], payload: unknown = {}) => {
    if (room.state === null) throw new Error("Room state is unavailable");
    const command = RoomCommandSchema.parse({
      requestId: crypto.randomUUID(),
      expectedStateVersion: room.state.stateVersion,
      type,
      payload,
    });
    await room.send(command);
  }, [room]);

  useEffect(() => {
    if (room.state === null || !("rulesetId" in room.state)) return;
    if (room.state.turn.phase !== "awaitingCardDraw") return;
    setCardDrawType(room.state.turn.deck === "chance" ? "chance" : "community-chest");
    setIsCardDrawModalOpen(true);
  }, [room.state]);

  const startGame = useCallback(() => sendIntent("startGame"), [sendIntent]);
  const leaveGame = useCallback(async () => {
    await sendIntent("leaveGame");
    await room.disconnect();
  }, [room, sendIntent]);
  const cancelGame = useCallback(async () => {
    await sendIntent("cancelGame");
    await room.disconnect();
  }, [room, sendIntent]);
  const rollDice = useCallback(() => sendIntent("rollDice"), [sendIntent]);
  const buyProperty = useCallback((position: number) => sendIntent("buyProperty", { position }), [sendIntent]);
  const skipProperty = useCallback((position: number) => sendIntent("declineProperty", { position }), [sendIntent]);
  const payRent = useCallback((position: number) => sendIntent("payRent", { position }), [sendIntent]);
  const endTurn = useCallback(() => sendIntent("endTurn"), [sendIntent]);
  const drawChanceCard = useCallback(() => sendIntent("drawChanceCard"), [sendIntent]);
  const drawCommunityChestCard = useCallback(() => sendIntent("drawCommunityChestCard"), [sendIntent]);
  const payJailFine = useCallback(() => sendIntent("payJailFine"), [sendIntent]);
  const useGetOutOfJailCard = useCallback(() => sendIntent("useJailCard"), [sendIntent]);
  const buildHouse = useCallback((position: number) => sendIntent("buildHouse", { position }), [sendIntent]);
  const buildHotel = useCallback((position: number) => sendIntent("buildHotel", { position }), [sendIntent]);
  const sellBuilding = useCallback((position: number, buildingType: BuildingType) => sendIntent("sellBuilding", {
    position,
    buildingType: buildingType === BuildingType.Hotel ? "hotel" : "house",
  }), [sendIntent]);
  const payMevTax = useCallback(() => sendIntent("payMevTax"), [sendIntent]);
  const payPriorityFeeTax = useCallback(() => sendIntent("payPriorityFeeTax"), [sendIntent]);
  const declareBankruptcy = useCallback(() => sendIntent("declareBankruptcy"), [sendIntent]);

  const createTrade = useCallback(async (
    receiverId: string,
    initiatorOffer: TradeOffer,
    targetOffer: TradeOffer,
  ) => {
    const offeredCash = initiatorOffer.money;
    const requestedCash = targetOffer.money;
    if (initiatorOffer.property !== null && requestedCash !== "0") {
      await sendIntent("createTrade", {
        tradeType: "propertyForMoney",
        receiverId,
        offeredPropertyPosition: initiatorOffer.property,
        requestedCash,
      });
    } else if (targetOffer.property !== null && offeredCash !== "0") {
      await sendIntent("createTrade", {
        tradeType: "moneyForProperty",
        receiverId,
        offeredCash,
        requestedPropertyPosition: targetOffer.property,
      });
    } else if (initiatorOffer.property !== null || targetOffer.property !== null) {
      await sendIntent("createTrade", {
        tradeType: "propertyOnly",
        receiverId,
        offeredPropertyPosition: initiatorOffer.property,
        requestedPropertyPosition: targetOffer.property,
      });
    } else {
      await sendIntent("createTrade", {
        tradeType: "moneyOnly",
        receiverId,
        offeredCash,
        requestedCash,
      });
    }
  }, [sendIntent]);
  const acceptTrade = useCallback((tradeId: string) => sendIntent("acceptTrade", { tradeId }), [sendIntent]);
  const rejectTrade = useCallback((tradeId: string) => sendIntent("rejectTrade", { tradeId }), [sendIntent]);
  const cancelTrade = useCallback((tradeId: string) => sendIntent("cancelTrade", { tradeId }), [sendIntent]);

  const showRollDice = isCurrentTurn && room.state !== null && "rulesetId" in room.state &&
    room.state.turn.phase === "awaitingRoll";
  const showEndTurn = isCurrentTurn && room.state !== null && "rulesetId" in room.state &&
    room.state.turn.phase === "awaitingEndTurn";
  const showPayJailFine = isCurrentTurn && ownPlayerState?.inJail === true;
  const showGetOutOfJailCard = showPayJailFine && (ownPlayerState?.getOutOfJailCards ?? 0) > 0;

  const getPropertyByPosition = useCallback(
    (position: number) => properties.find((property) => property.position === position) ?? null,
    [properties],
  );
  const getPlayerByAddress = useCallback(
    (address: string) => players.find((player) => player.wallet === address) ?? null,
    [players],
  );
  const isCurrentPlayerTurn = useCallback(() => isCurrentTurn, [isCurrentTurn]);
  const canRollDice = useCallback(() => showRollDice, [showRollDice]);
  const canPlayerAct = useCallback(() => isCurrentTurn, [isCurrentTurn]);
  const refetch = useCallback(async () => undefined, []);

  const value = useMemo<GameContextType>(() => ({
    gameAddress,
    setGameAddress,
    currentPlayerAddress,
    currentPlayerState,
    ownPlayerId: room.playerId,
    gameState,
    players,
    properties,
    gameLoading: room.status === "connecting" || room.state === null,
    gameError: room.error,
    refetch,
    startGame,
    resetGame: () => unsupported("Reset game"),
    closeGame: () => unsupported("Close game"),
    joinGame: () => unsupported("Join game"),
    leaveGame,
    cancelGame,
    rollDice,
    buyProperty,
    skipProperty,
    payRent,
    endTurn,
    drawChanceCard,
    drawCommunityChestCard,
    payJailFine,
    useGetOutOfJailCard,
    buildHouse,
    buildHotel,
    sellBuilding,
    payMevTax,
    payPriorityFeeTax,
    declareBankruptcy,
    endGame: () => unsupported("Manual end game"),
    createTrade,
    acceptTrade,
    rejectTrade,
    cancelTrade,
    selectedProperty,
    setSelectedProperty,
    isPropertyDialogOpen,
    setIsPropertyDialogOpen,
    isCardDrawModalOpen,
    setIsCardDrawModalOpen,
    cardDrawType,
    setCardDrawType,
    isCurrentTurn,
    showRollDice,
    showEndTurn,
    showPayJailFine,
    showGetOutOfJailCard,
    getPropertyByPosition,
    getPlayerByAddress,
    isCurrentPlayerTurn,
    canRollDice,
    canPlayerAct,
    demoDices,
    setDemoDices,
  }), [
    acceptTrade, buildHotel, buildHouse, buyProperty, cancelGame, cancelTrade, canPlayerAct,
    canRollDice, cardDrawType, createTrade, currentPlayerAddress, currentPlayerState,
    declareBankruptcy, demoDices, drawChanceCard, drawCommunityChestCard, endTurn, gameAddress,
    gameState, getPlayerByAddress, getPropertyByPosition, isCardDrawModalOpen, isCurrentPlayerTurn,
    isCurrentTurn, isPropertyDialogOpen, leaveGame, payJailFine, payMevTax, payPriorityFeeTax,
    payRent, players, properties, refetch, rejectTrade, rollDice, room.error, room.playerId,
    room.state, room.status, selectedProperty, sellBuilding, showEndTurn, showGetOutOfJailCard,
    showPayJailFine, showRollDice, skipProperty, startGame, useGetOutOfJailCard,
  ]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}
