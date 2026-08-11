import type { GameplayEventPayload, LifecycleEventPayload } from "@pootown/game-contracts";

import { boardData, surpriseCards, treasureCards } from "../configs/board-data.js";
import type { GameLogEntry } from "../types/space-types.js";

type DomainPayload = GameplayEventPayload | LifecycleEventPayload;
type NewLogEntry = Omit<GameLogEntry, "id" | "timestamp">;

function getPropertyName(position: number): string {
  return boardData[position]?.name ?? `Position ${position}`;
}

function getCardData(cardType: "chance" | "community-chest", cardIndex: number) {
  const cards = cardType === "chance" ? surpriseCards : treasureCards;
  return cards.find((card) => card.id === cardIndex) ?? null;
}

export function mapRoomEventToLog(
  payload: DomainPayload,
  gameId: string,
  eventId: string,
): NewLogEntry | null {
  const base = { gameId, signature: eventId };
  switch (payload.type) {
    case "playerJoined":
      return { ...base, type: "PlayerJoined", playerId: payload.playerId };
    case "playerLeft":
      return { ...base, type: "PlayerLeft", playerId: payload.playerId };
    case "gameStarted":
      return { ...base, type: "GameStarted", playerId: "system" };
    case "gameCancelled":
      return { ...base, type: "GameCancelled", playerId: "system" };
    case "playerMoved":
      return payload.passedGo
        ? {
            ...base,
            type: "PlayerPassedGo",
            playerId: payload.playerId,
            details: { fromPosition: payload.fromPosition, toPosition: payload.toPosition, passedGo: true, amount: payload.salaryCollected },
          }
        : null;
    case "propertyPurchased":
      return {
        ...base,
        type: "PropertyPurchased",
        playerId: payload.playerId,
        details: { propertyName: getPropertyName(payload.position), position: payload.position, price: payload.price },
      };
    case "propertyDeclined":
      return {
        ...base,
        type: "PropertyDeclined",
        playerId: payload.playerId,
        details: { propertyName: getPropertyName(payload.position), position: payload.position, price: payload.price },
      };
    case "rentPaid":
      return {
        ...base,
        type: "RentPaid",
        playerId: payload.payerId,
        details: { owner: payload.ownerId, position: payload.position, propertyName: getPropertyName(payload.position), amount: payload.amount },
      };
    case "cardDrawn": {
      const cardType = payload.deck === "chance" ? "chance" : "community-chest";
      const card = getCardData(cardType, payload.cardId - 1);
      return {
        ...base,
        type: payload.deck === "chance" ? "ChanceCardDrawn" : "CommunityChestCardDrawn",
        playerId: payload.playerId,
        details: { cardType, cardIndex: payload.cardId - 1, cardTitle: card?.title, cardDescription: card?.description },
      };
    }
    case "jailEntered":
      return { ...base, type: "SpecialSpaceAction", playerId: payload.playerId, details: { spaceType: 2 } };
    case "taxPaid":
      return { ...base, type: "TaxPaid", playerId: payload.playerId, details: { position: payload.position, taxType: payload.taxKind, amount: payload.amount } };
    case "buildingBuilt":
      return {
        ...base,
        type: payload.buildingType === "hotel" ? "HotelBuilt" : "HouseBuilt",
        playerId: payload.playerId,
        details: { position: payload.position, buildingType: payload.buildingType, houseCount: payload.houseCount, price: payload.cost },
      };
    case "buildingSold":
      return { ...base, type: "BuildingSold", playerId: payload.playerId, details: { position: payload.position, buildingType: payload.buildingType, price: payload.salePrice } };
    case "tradeCreated":
      return {
        ...base,
        type: "TradeCreated",
        playerId: payload.proposerId,
        details: {
          tradeId: payload.tradeId,
          targetPlayer: payload.receiverId,
          offeredMoney: payload.offeredCash,
          requestedMoney: payload.requestedCash,
          offeredProperties: payload.offeredPropertyPosition,
          requestedProperties: payload.requestedPropertyPosition,
        },
      };
    case "tradeAccepted":
      return { ...base, type: "TradeAccepted", playerId: payload.receiverId, details: { tradeId: payload.tradeId, targetPlayer: payload.proposerId } };
    case "tradeRejected":
      return { ...base, type: "TradeRejected", playerId: payload.rejecterId, details: { tradeId: payload.tradeId } };
    case "tradeCancelled":
      return { ...base, type: "TradeCancelled", playerId: payload.cancellerId, details: { tradeId: payload.tradeId } };
    case "playerBankrupt":
      return {
        ...base,
        type: "PlayerBankrupt",
        playerId: payload.playerId,
        details: { owner: payload.creditorId ?? undefined, liquidationValue: payload.liquidationValue, cashTransferred: payload.cashTransferred },
      };
    case "gameEnded":
      return {
        ...base,
        type: "GameEnded",
        playerId: payload.winnerId,
        details: { winner: payload.winnerId, winnerNetWorth: payload.ranking[0]?.netWorth ?? "0" },
      };
    default:
      return null;
  }
}
