import { address } from "@solana/kit";
import envConfig from "./env";

export const DELEGATION_PROGRAM_ID = address(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);

export const DEFAULT_EPHEMERAL_QUEUE = address(
  "5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc"
);

export const VRF_PROGRAM_IDENTITY = address(
  "9irBy75QS2BN81FUgXuHcjqceJJRuc9oDkAe8TKVvvAw"
);

export const PLATFORM_ID = address(
  // "8woHMJSrVW3nEbv19PCnMkenVyyLpgoS6XGeDeTBhLpb"
  "GgUmA1zccSggfKxPsxmEAjzTrHekFeShobfFKNvqAS6n"
);

export const MEV_TAX_POSITION = 4;
export const PRIORITY_FEE_TAX_POSITION = 38;
export const JAIL_FINE = 50;
export const USE_VRF = false;

export const PLAYER_COLORS = ["#00c8f0", "#ff4d50", "#ffbf00", "#00d696"];

// EVENT DISCRIMINATORS
export const CHANCE_CARD_DRAWN_EVENT_DISCRIMINATOR = new Uint8Array([
  117, 139, 184, 221, 43, 65, 0, 208,
]);
export const COMMUNITY_CHEST_CARD_DRAWN_EVENT_DISCRIMINATOR = new Uint8Array([
  81, 71, 245, 66, 80, 31, 199, 184,
]);

export const PLAYER_PASSED_GO_EVENT_DISCRIMINATOR = new Uint8Array([
  217, 210, 43, 19, 64, 171, 171, 233,
]);
// game

export const GAME_STARTED_EVENT_DISCRIMINATOR = new Uint8Array([
  222, 247, 78, 255, 61, 184, 156, 41,
]);

export const GAME_ENDED_EVENT_DISCRIMINATOR = new Uint8Array([
  35, 93, 113, 153, 29, 144, 200, 109,
]);

export const PLAYER_JOINED_EVENT_DISCRIMINATOR = new Uint8Array([
  39, 144, 49, 106, 108, 210, 183, 38,
]);

export const PLAYER_LEFT_EVENT_DISCRIMINATOR = new Uint8Array([
  7, 106, 62, 150, 175, 170, 96, 84,
]);

export const GAME_CANCELLED_EVENT_DISCRIMINATOR = new Uint8Array([
  113, 20, 200, 104, 76, 35, 9, 241,
]);

//trade

export const TRADE_CREATED_EVENT_DISCRIMINATOR = new Uint8Array([
  110, 86, 122, 20, 81, 78, 181, 72,
]);

export const TRADE_ACCEPTED_EVENT_DISCRIMINATOR = new Uint8Array([
  111, 233, 226, 39, 146, 226, 46, 44,
]);

export const TRADE_REJECTED_EVENT_DISCRIMINATOR = new Uint8Array([
  78, 140, 237, 120, 123, 13, 106, 132,
]);

export const TRADE_CANCELLED_EVENT_DISCRIMINATOR = new Uint8Array([
  228, 218, 59, 27, 43, 158, 22, 227,
]);

export const TRADES_CLEANED_UP_EVENT_DISCRIMINATOR = new Uint8Array([
  189, 38, 153, 26, 24, 135, 212, 211,
]);

export const PROPERTY_PURCHASED_EVENT_DISCRIMINATOR = new Uint8Array([
  72, 203, 117, 173, 36, 131, 191, 177,
]);

export const PROPERTY_DECLINED_EVENT_DISCRIMINATOR = new Uint8Array([
  123, 204, 199, 158, 227, 148, 10, 1,
]);

export const RENT_PAID_EVENT_DISCRIMINATOR = new Uint8Array([
  140, 29, 172, 69, 152, 38, 73, 241,
]);

export const HOUSE_BUILT_EVENT_DISCRIMINATOR = new Uint8Array([
  155, 4, 132, 160, 248, 0, 173, 69,
]);

export const HOTEL_BUILT_EVENT_DISCRIMINATOR = new Uint8Array([
  249, 66, 89, 214, 102, 134, 84, 161,
]);

export const BUILDING_SOLD_EVENT_DISCRIMINATOR = new Uint8Array([
  84, 142, 164, 79, 209, 108, 129, 231,
]);

export const PROPERTY_MORTGAGED_EVENT_DISCRIMINATOR = new Uint8Array([
  64, 120, 24, 42, 74, 43, 209, 95,
]);

export const PROPERTY_UNMORTGAGED_EVENT_DISCRIMINATOR = new Uint8Array([
  183, 108, 222, 183, 178, 20, 101, 21,
]);

export const SPECIAL_SPACE_ACTION_EVENT_DISCRIMINATOR = new Uint8Array([
  25, 55, 0, 182, 68, 132, 132, 223,
]);

export const PLAYER_BANKRUPT_EVENT_DISCRIMINATOR = new Uint8Array([
  242, 72, 207, 196, 238, 112, 23, 47,
]);

export const TAX_PAID_EVENT_DISCRIMINATOR = new Uint8Array([
  4, 134, 57, 255, 63, 46, 212, 238,
]);

export const GAME_END_CONDITION_MET_EVENT_DISCRIMINATOR = new Uint8Array([
  1, 222, 18, 208, 75, 120, 233, 201,
]);

export const PRIZE_CLAIMED_EVENT_DISCRIMINATOR = new Uint8Array([
  213, 150, 192, 76, 199, 33, 212, 38,
]);
