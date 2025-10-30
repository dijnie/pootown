import { Address } from "@solana/kit";

export interface PlayerConfig {
  color: string;
  avatar: string;
  name?: string;
}

// Predefined color palette for players
const PLAYER_COLORS = [
  "#FF6B6B", // Red
  "#4ECDC4", // Teal
  "#45B7D1", // Blue
  "#96CEB4", // Green
  "#FFEAA7", // Yellow
  "#DDA0DD", // Plum
  "#98D8C8", // Mint
  "#F7DC6F", // Light Yellow
  "#BB8FCE", // Light Purple
  "#85C1E9", // Light Blue
  "#F8C471", // Orange
  "#82E0AA", // Light Green
];

// Predefined avatars for players
const PLAYER_AVATARS = [
  "🎩", // Top hat
  "🎯", // Target
  "🎲", // Dice
  "🎪", // Circus tent
  "🎨", // Artist palette
  "🎭", // Theater masks
  "🎸", // Guitar
  "🎺", // Trumpet
  "🚗", // Car
  "🚕", // Taxi
  "🚙", // SUV
  "🚌", // Bus
];

/**
 * Generate a consistent player configuration based on wallet address
 */
export function generatePlayerConfig(address: Address, playerIndex?: number): PlayerConfig {
  // If we have a player index (from game state), use it for consistency
  if (typeof playerIndex === 'number') {
    return {
      color: PLAYER_COLORS[playerIndex % PLAYER_COLORS.length],
      avatar: PLAYER_AVATARS[playerIndex % PLAYER_AVATARS.length],
    };
  }

  // Otherwise, generate based on address hash for consistency
  const hash = address.split('').reduce((acc, char) => {
    return acc + char.charCodeAt(0);
  }, 0);

  return {
    color: PLAYER_COLORS[hash % PLAYER_COLORS.length],
    avatar: PLAYER_AVATARS[hash % PLAYER_AVATARS.length],
  };
}

/**
 * Get player display name from address
 */
export function getPlayerDisplayName(address: Address, customName?: string): string {
  if (customName) return customName;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Generate player configuration for all players in a game
 */
export function generatePlayersConfig(playerAddresses: Address[]): Map<Address, PlayerConfig & { index: number }> {
  const playersConfig = new Map<Address, PlayerConfig & { index: number }>();
  
  playerAddresses.forEach((address, index) => {
    const config = generatePlayerConfig(address, index);
    playersConfig.set(address, {
      ...config,
      index,
      name: getPlayerDisplayName(address),
    });
  });
  
  return playersConfig;
}