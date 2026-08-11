import { GameEvent } from "@/lib/sdk/types";
import { GameLogEntry } from "@/types/space-types";
import { getPropertyName, getCardData } from "@/lib/log-utils";
import { formatAddress } from "@/lib/utils";
import { isSome } from "@solana/kit";

export function mapEventToLogEntry(event: GameEvent): GameLogEntry {
  const baseEntry = {
    id: crypto.randomUUID(),
    gameId: event.data.game.toString(),
    type: event.type,
    timestamp: Date.now(),
    playerId: "",
    signature: event.signature,
  };

  switch (event.type) {
    case "PlayerJoined":
      return {
        ...baseEntry,
        playerId: formatAddress(event.data.player.toString()),
      };

    case "PlayerLeft":
      return {
        ...baseEntry,
        // type: "leave",
        playerId: formatAddress(event.data.player.toString()),
        // details: {
        //   refundAmount: Number(event.data.refundAmount),
        //   remainingPlayers: event.data.remainingPlayers,
        // },
      };

    case "GameStarted":
      return {
        ...baseEntry,
        // type: "game",
        playerId: formatAddress(event.data.firstPlayer.toString()),
        // details: {
        //   totalPlayers: event.data.totalPlayers,
        //   firstPlayer: event.data.firstPlayer.toString(),
        // },
      };

    case "GameCancelled":
      return {
        ...baseEntry,
        // type: "game",
        playerId: formatAddress(event.data.creator.toString()),
        // details: {
        //   playersCount: event.data.playersCount,
        //   refundAmount: Number(event.data.refundAmount),
        // },
      };

    case "PlayerPassedGo":
      return {
        ...baseEntry,
        // type: "move",
        playerId: formatAddress(event.data.player.toString()),
        details: {
          toPosition: event.data.newPosition,
          passedGo: true,
          amount: Number(event.data.salaryCollected),
        },
      };

    case "PropertyPurchased":
      const propertyName = getPropertyName(event.data.propertyPosition);
      return {
        ...baseEntry,
        // type: "purchase",
        playerId: formatAddress(event.data.player.toString()),
        details: {
          propertyName,
          position: event.data.propertyPosition,
          price: Number(event.data.price),
        },
      };

    case "PropertyDeclined":
      const declinedPropertyName = getPropertyName(event.data.propertyPosition);
      return {
        ...baseEntry,
        // type: "skip",
        playerId: formatAddress(event.data.player.toString()),
        details: {
          propertyName: declinedPropertyName,
          position: event.data.propertyPosition,
          price: Number(event.data.price),
        },
      };

    case "RentPaid":
      const rentPropertyName = getPropertyName(event.data.propertyPosition);
      return {
        ...baseEntry,
        // type: "rent",
        playerId: formatAddress(event.data.payer.toString()),
        details: {
          propertyName: rentPropertyName,
          position: event.data.propertyPosition,
          amount: Number(event.data.amount),
          owner: event.data.owner.toString(),
        },
      };

    case "ChanceCardDrawn":
      const chanceCard = getCardData("chance", event.data.cardIndex);
      return {
        ...baseEntry,
        // type: "card",
        playerId: formatAddress(event.data.player.toString()),
        details: {
          cardType: "chance" as const,
          cardIndex: event.data.cardIndex,
          cardTitle: chanceCard?.title,
          cardDescription: chanceCard?.description,
          effectType: event.data.effectType,
          amount: event.data.amount,
        },
      };

    case "CommunityChestCardDrawn":
      const treasureCard = getCardData("community-chest", event.data.cardIndex);
      return {
        ...baseEntry,
        // type: "card",
        playerId: formatAddress(event.data.player.toString()),
        details: {
          cardType: "community-chest" as const,
          cardIndex: event.data.cardIndex,
          cardTitle: treasureCard?.title,
          cardDescription: treasureCard?.description,
          effectType: event.data.effectType,
          amount: event.data.amount,
        },
      };

    case "HouseBuilt":
      const housePropertyName = getPropertyName(event.data.propertyPosition);
      return {
        ...baseEntry,
        // type: "building",
        playerId: formatAddress(event.data.player.toString()),
        details: {
          buildingType: "house" as const,
          propertyName: housePropertyName,
          position: event.data.propertyPosition,
          price: Number(event.data.cost),
          houseCount: event.data.houseCount,
        },
      };

    case "HotelBuilt":
      const hotelPropertyName = getPropertyName(event.data.propertyPosition);
      return {
        ...baseEntry,
        // type: "building",
        playerId: formatAddress(event.data.player.toString()),
        details: {
          buildingType: "hotel" as const,
          propertyName: hotelPropertyName,
          position: event.data.propertyPosition,
          price: Number(event.data.cost),
        },
      };

    case "BuildingSold":
      const soldPropertyName = getPropertyName(event.data.propertyPosition);
      return {
        ...baseEntry,
        // type: "building",
        playerId: formatAddress(event.data.player.toString()),
        details: {
          buildingType: event.data.buildingType as "house" | "hotel",
          propertyName: soldPropertyName,
          position: event.data.propertyPosition,
          price: Number(event.data.salePrice),
        },
      };

    case "PropertyMortgaged":
      const mortgagedPropertyName = getPropertyName(
        event.data.propertyPosition
      );
      return {
        ...baseEntry,
        // type: "purchase",
        playerId: formatAddress(event.data.player.toString()),
        details: {
          propertyName: mortgagedPropertyName,
          position: event.data.propertyPosition,
          price: Number(event.data.mortgageValue),
        },
      };

    case "PropertyUnmortgaged":
      const unmortgagedPropertyName = getPropertyName(
        event.data.propertyPosition
      );
      return {
        ...baseEntry,
        // type: "purchase",
        playerId: formatAddress(event.data.player.toString()),
        details: {
          propertyName: unmortgagedPropertyName,
          position: event.data.propertyPosition,
          price: Number(event.data.unmortgageCost),
        },
      };

    case "TaxPaid":
      const taxType = event.data.taxType;
      const taxTypeName =
        taxType === 1 ? "MEV Tax" : taxType === 2 ? "Priority Fee Tax" : "Tax";
      return {
        ...baseEntry,
        playerId: formatAddress(event.data.player.toString()),
        details: {
          taxType: taxTypeName,
          amount: Number(event.data.amount),
          position: event.data.position,
        },
      };

    case "SpecialSpaceAction":
      return {
        ...baseEntry,
        // type:
        //   event.data.spaceType === 0 || event.data.spaceType === 2
        //     ? "jail"
        //     : "move",
        playerId: formatAddress(event.data.player.toString()),
        details: {
          position: event.data.position,
          spaceType: event.data.spaceType,
        },
      };

    case "TradeCreated":
      return {
        ...baseEntry,
        // type: "trade",
        playerId: formatAddress(event.data.proposer.toString()),
        details: {
          action: "created",
          tradeId: event.data.tradeId.toString(),
          targetPlayer: event.data.receiver.toString(),
          offeredMoney: Number(event.data.proposerMoney),
          requestedMoney: Number(event.data.receiverMoney),
          offeredProperties: isSome(event.data.proposerProperty)
            ? event.data.proposerProperty.value
            : null,
          requestedProperties: isSome(event.data.receiverProperty)
            ? event.data.receiverProperty.value
            : null,
        },
      };

    case "TradeAccepted":
      return {
        ...baseEntry,
        // type: "trade",
        playerId: formatAddress(event.data.accepter.toString()),
        details: {
          action: "accepted",
          tradeId: event.data.tradeId.toString(),
          targetPlayer: event.data.proposer.toString(),
        },
      };

    case "TradeRejected":
      return {
        ...baseEntry,
        // type: "trade",
        playerId: formatAddress(event.data.rejecter.toString()),
        details: {
          action: "rejected",
          tradeId: event.data.tradeId.toString(),
          targetPlayer: event.data.proposer.toString(),
        },
      };

    case "TradeCancelled":
      return {
        ...baseEntry,
        // type: "trade",
        playerId: formatAddress(event.data.canceller.toString()),
        details: {
          action: "cancelled",
          tradeId: event.data.tradeId.toString(),
        },
      };

    case "TradesCleanedUp":
      return {
        ...baseEntry,
        // type: "game",
        playerId: "System",
        details: {
          // tradesRemoved: event.data.tradesRemoved,
          remainingTrades: event.data.remainingTrades,
        },
      };

    case "PlayerBankrupt":
      return {
        ...baseEntry,
        // type: "bankruptcy",
        playerId: formatAddress(event.data.player.toString()),
        details: {
          liquidationValue: Number(event.data.liquidationValue),
          cashTransferred: Number(event.data.cashTransferred),
        },
      };

    case "GameEnded":
      const winner = isSome(event.data.winner) ? event.data.winner.value : null;

      return {
        ...baseEntry,
        // type: "game",
        playerId: winner ? formatAddress(winner.toString()) : "System",
        details: {
          winner: winner,
          winnerNetWorth: isSome(event.data.winnerNetWorth)
            ? Number(event.data.winnerNetWorth.value)
            : undefined,
        },
      };

    // case "GameEndConditionMet":
    //   return {
    //     ...baseEntry,
    //     // type: "game",
    //     playerId: "System",
    //     details: {
    //       // reason: event.data.reason,
    //     },
    //   };

    case "PrizeClaimed":
      return {
        ...baseEntry,
        // type: "game",
        playerId: formatAddress(event.data.winner.toString()),
        details: {
          prizeAmount: Number(event.data.prizeAmount),
        },
      };

    default:
      // Fallback for unknown event types
      return {
        ...baseEntry,
        // type: "game",
        playerId: "System",
      };
  }
}
