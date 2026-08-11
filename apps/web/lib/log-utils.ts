import { Address } from "@solana/kit";
import { getBoardSpaceData } from "./board-utils";
import { surpriseCards, treasureCards } from "@/configs/board-data";
import { formatAddress } from "./utils";
import { GameLogEntry } from "@/types/space-types";

export const getPlayerDisplayName = (address: Address): string => {
  // For now, just use formatted address
  // In the future, this could check for ENS names or custom player names
  return formatAddress(address);
};

// Property name utilities
export const getPropertyName = (position: number): string => {
  const spaceData = getBoardSpaceData(position);
  return spaceData?.name || `Position ${position}`;
};

// Card utilities
export const getCardData = (
  cardType: "chance" | "community-chest",
  cardIndex: number
) => {
  const cards = cardType === "chance" ? surpriseCards : treasureCards;
  return cards.find((card) => card.id === cardIndex) || null;
};

// Log message templates
export const LOG_MESSAGE_TEMPLATES = {
  // Player actions
  join: (playerName: string) => `${playerName} joined room`,

  // Dice rolling
  dice: (playerName: string, dice?: [number, number]) => {
    if (dice) {
      return `${playerName} rolled ${dice[0]} and ${dice[1]}`;
    }
    return `${playerName} rolled the dice`;
  },

  // Movement
  move: (
    playerName: string,
    fromPos: number,
    toPos: number,
    passedGo?: boolean
  ) => {
    const fromName = getPropertyName(fromPos);
    const toName = getPropertyName(toPos);
    const baseMessage = `${playerName} moved from ${fromName} to ${toName}`;
    return passedGo ? `${baseMessage} and passed Solana Genesis` : baseMessage;
  },

  // Property transactions
  purchase: (playerName: string, propertyName: string, price?: number) => {
    if (price) {
      return `${playerName} bought ${propertyName} for $${price}`;
    }
    return `${playerName} bought ${propertyName}`;
  },

  skip: (playerName: string, propertyName: string) =>
    `${playerName} declined to buy ${propertyName}`,

  // Rent payments
  rent: (payer: string, owner: string, amount?: number, property?: string) => {
    if (amount && property) {
      return `${payer} paid $${amount} rent to ${owner} for ${property}`;
    }
    return `${payer} paid rent to ${owner}`;
  },

  // Card draws
  card_draw: (playerName: string, cardType: "chance" | "community-chest") => {
    const deckName =
      cardType === "chance" ? "Pump.fun Surprise" : "Airdrop Chest";
    return `${playerName} drew a card from ${deckName}`;
  },

  card_effect: (
    playerName: string,
    cardTitle: string,
    cardDescription: string
  ) => `${playerName} got ${cardTitle}: ${cardDescription}`,

  // Jail events
  jail_doubles: (playerName: string) =>
    `${playerName} rolled doubles 3 times in a row and went to Validator Jail`,

  jail_fine: (playerName: string, amount: number) =>
    `${playerName} paid $${amount} to get out of Validator Jail`,

  jail_card: (playerName: string) =>
    `${playerName} used a Get Out of Jail Free card`,

  // Special spaces
  start_landing: (playerName: string, amount: number) =>
    `${playerName} landed on Solana Genesis and received $${amount}`,

  pass_go: (playerName: string, amount: number) =>
    `${playerName} passed through Solana Genesis and received $${amount}`,

  tax_payment: (playerName: string, taxType: string, amount: number) =>
    `${playerName} paid $${amount} ${taxType} tax`,

  vacation: (playerName: string) =>
    `${playerName} will spend a turn while on vacation`,

  // Building
  building: (
    playerName: string,
    buildingType: "house" | "hotel",
    propertyName: string
  ) => `${playerName} built a ${buildingType} on ${propertyName}`,

  // Trade events
  trade_created: (creator: string, target: string) =>
    `${creator} created a trade with ${target}`,

  trade_accepted: (accepter: string, creator: string) =>
    `${accepter} accepted a trade from ${creator}`,

  trade_declined: (decliner: string, creator: string) =>
    `${decliner} declined a trade created by ${creator}`,

  trade_cancelled: (creator: string) =>
    `${creator} cancelled their trade offer`,

  // Turn management
  turn: (playerName: string) => `${playerName} ended their turn`,

  turn_start: (playerName: string) => `It's ${playerName}'s turn`,

  // Game events
  game_start: () => "Game started!",
  game_end: (winner: string) => `${winner} won the game!`,

  // Bankruptcy
  bankruptcy: (playerName: string) =>
    `${playerName} is checking for bankruptcy`,

  bankruptcy_declared: (playerName: string) =>
    `${playerName} declared bankruptcy`,
};

// Enhanced log message generator
// export const generateLogMessage = (log: GameLogEntry): string => {
//   const playerName = log.playerId; //getPlayerDisplayName(log.playerId);
//   const details = log.details || {};

//   switch (log.type) {
//     case "join":
//       return LOG_MESSAGE_TEMPLATES.join(playerName);

//     case "dice":
//       const diceRoll = details.diceRoll as [number, number] | undefined;
//       return LOG_MESSAGE_TEMPLATES.dice(playerName, diceRoll);

//     case "move":
//       const fromPos = details.fromPosition as number;
//       const toPos = details.toPosition as number;
//       const passedGo = details.passedGo as boolean;
//       if (fromPos !== undefined && toPos !== undefined) {
//         return LOG_MESSAGE_TEMPLATES.move(playerName, fromPos, toPos, passedGo);
//       }
//       return log.message; // Fallback to original message

//     case "purchase":
//       const propertyName =
//         details.propertyName || getPropertyName(details.position || 0);
//       const price = details.price as number;
//       return LOG_MESSAGE_TEMPLATES.purchase(playerName, propertyName, price);

//     case "skip":
//       const skippedProperty =
//         details.propertyName || getPropertyName(details.position || 0);
//       return LOG_MESSAGE_TEMPLATES.skip(playerName, skippedProperty);

//     case "rent":
//       const owner = details.owner as Address;
//       const ownerName = owner ? getPlayerDisplayName(owner) : "unknown";
//       const rentAmount = details.amount as number;
//       const rentProperty =
//         details.propertyName || getPropertyName(details.position || 0);
//       return LOG_MESSAGE_TEMPLATES.rent(
//         playerName,
//         ownerName,
//         rentAmount,
//         rentProperty
//       );

//     case "card":
//       const cardType = details.cardType as "chance" | "community-chest";
//       const cardIndex = details.cardIndex as number;
//       const cardTitle = details.cardTitle as string;
//       const cardDescription = details.cardDescription as string;

//       if (cardTitle && cardDescription) {
//         return LOG_MESSAGE_TEMPLATES.card_effect(
//           playerName,
//           cardTitle,
//           cardDescription
//         );
//       } else if (cardType && cardIndex) {
//         const cardData = getCardData(cardType, cardIndex);
//         if (cardData) {
//           return LOG_MESSAGE_TEMPLATES.card_effect(
//             playerName,
//             cardData.title,
//             cardData.description
//           );
//         }
//       }

//       if (cardType) {
//         return LOG_MESSAGE_TEMPLATES.card_draw(playerName, cardType);
//       }
//       return log.message;

//     case "jail":
//       const jailReason = details.jailReason as string;
//       const fineAmount = details.fineAmount as number;

//       if (jailReason === "doubles") {
//         return LOG_MESSAGE_TEMPLATES.jail_doubles(playerName);
//       } else if (fineAmount) {
//         return LOG_MESSAGE_TEMPLATES.jail_fine(playerName, fineAmount);
//       }
//       return log.message;

//     case "building":
//       const buildingType = details.buildingType as "house" | "hotel";
//       const buildingProperty =
//         details.propertyName || getPropertyName(details.position || 0);
//       return LOG_MESSAGE_TEMPLATES.building(
//         playerName,
//         buildingType,
//         buildingProperty
//       );

//     case "trade":
//       const targetPlayer = details.targetPlayer as Address;
//       const targetPlayerName = targetPlayer
//         ? getPlayerDisplayName(targetPlayer)
//         : "unknown";

//       // Determine trade action from message or details
//       if (log.message.includes("created")) {
//         return LOG_MESSAGE_TEMPLATES.trade_created(
//           playerName,
//           targetPlayerName
//         );
//       } else if (log.message.includes("accepted")) {
//         return LOG_MESSAGE_TEMPLATES.trade_accepted(
//           playerName,
//           targetPlayerName
//         );
//       } else if (log.message.includes("declined")) {
//         return LOG_MESSAGE_TEMPLATES.trade_declined(
//           playerName,
//           targetPlayerName
//         );
//       } else if (log.message.includes("cancelled")) {
//         return LOG_MESSAGE_TEMPLATES.trade_cancelled(playerName);
//       }
//       return log.message;

//     case "turn":
//       return LOG_MESSAGE_TEMPLATES.turn(playerName);

//     case "game":
//       if (log.message.includes("won")) {
//         return LOG_MESSAGE_TEMPLATES.game_end(playerName);
//       } else if (log.message.includes("started")) {
//         return LOG_MESSAGE_TEMPLATES.game_start();
//       }
//       return log.message;

//     case "bankruptcy":
//       if (log.message.includes("declared")) {
//         return LOG_MESSAGE_TEMPLATES.bankruptcy_declared(playerName);
//       }
//       return LOG_MESSAGE_TEMPLATES.bankruptcy(playerName);

//     default:
//       return log.message;
//   }
// };

// Log entry type icons
export const LOG_TYPE_ICONS = {
  join: "👋",
  dice: "🎲",
  move: "🚶",
  purchase: "🏠",
  skip: "❌",
  rent: "💰",
  card: "🎴",
  jail: "🔒",
  building: "🏗️",
  trade: "🤝",
  turn: "⏭️",
  game: "🎮",
  bankruptcy: "💸",
} as const;

// Get relative time string
export const getRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) {
    // Less than 1 minute
    return "just now";
  } else if (diff < 3600000) {
    // Less than 1 hour
    const minutes = Math.floor(diff / 60000);
    return `${minutes}m ago`;
  } else if (diff < 86400000) {
    // Less than 1 day
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  } else {
    const days = Math.floor(diff / 86400000);
    return `${days}d ago`;
  }
};
