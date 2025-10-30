import { PublicKey } from "@solana/web3.js";

// Test constants matching the program constants
export const TEST_CONSTANTS = {
  MAX_PLAYERS: 4,
  MIN_PLAYERS: 2,
  BOARD_SIZE: 40,
  STARTING_MONEY: 1500,
  GO_SALARY: 200,
  JAIL_FINE: 50,
  MAX_JAIL_TURNS: 3,
  TOTAL_HOUSES: 32,
  TOTAL_HOTELS: 12,
  JAIL_POSITION: 10,
  GO_POSITION: 0,
  GO_TO_JAIL_POSITION: 30,
  FREE_PARKING_POSITION: 20,
};

export const GAME_STATUS = {
  WAITING_FOR_PLAYERS: { waitingForPlayers: {} },
  IN_PROGRESS: { inProgress: {} },
  FINISHED: { finished: {} },
};

export const PROPERTY_POSITIONS = {
  MEDITERRANEAN_AVENUE: 1,
  BALTIC_AVENUE: 3,
  READING_RAILROAD: 5,
  ORIENTAL_AVENUE: 6,
  ELECTRIC_COMPANY: 12,
  BOARDWALK: 39,
};


export const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);