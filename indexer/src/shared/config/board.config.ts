/**
 * Monopoly Board Configuration
 *
 * Contains all board-related constants and configurations including
 * property positions, prices, rent calculations, and board space types.
 *
 * This module provides a centralized, reusable configuration that mirrors
 * the classic Monopoly board layout adapted for Panda Monopoly.
 *
 * @author Senior Engineer - Following Google Code Standards
 */

// ==================== LOG IDENTIFIERS ====================

/**
 * Blockchain log identifiers for different monopoly events
 */
export const MONOPOLY_LOGS = {
  PLATFORM_CREATE: 'monopoly:platform:create',
  PLATFORM_UPDATE: 'monopoly:platform:update',
  GAME_CREATE: 'monopoly:game:create',
  GAME_UPDATE: 'monopoly:game:update',
  PLAYER_UPDATE: 'monopoly:player:update',
  PROPERTY_UPDATE: 'monopoly:property:update',
  TRADE_OPEN: 'monopoly:trade:open',
  TRADE_UPDATE: 'monopoly:trade:update'
} as const

// ==================== BOARD SPACE TYPES ====================

/**
 * Property space with all associated financial parameters
 */
export interface PropertySpace {
  readonly type: 'property'
  readonly price: number
  readonly rentWith1House?: number
  readonly rentWith2Houses?: number
  readonly rentWith3Houses?: number
  readonly rentWith4Houses?: number
  readonly houseCost?: number
}

/**
 * Non-property board spaces (utilities, railroads, special spaces)
 */
export interface SpecialSpace {
  readonly type: 'railroad' | 'utility' | 'corner' | 'tax' | 'card' | 'jail'
}

/**
 * Union type for all possible board spaces
 */
export type BoardSpace = PropertySpace | SpecialSpace

// ==================== BOARD CONFIGURATION ====================

/**
 * Complete Monopoly board configuration mapping position to space data
 *
 * Positions follow standard Monopoly numbering:
 * - 0: GO
 * - 1-39: Regular board positions clockwise
 * - Properties have detailed rent/cost information
 * - Special spaces (utilities, railroads) marked by type only
 */
export const MONOPOLY_BOARD_SPACES: Readonly<Record<number, BoardSpace>> = {
  // BROWN COLOR GROUP (Mediterranean/Baltic Avenue equivalent)
  1: {
    type: 'property',
    price: 60,
    rentWith1House: 10,
    rentWith2Houses: 30,
    rentWith3Houses: 90,
    rentWith4Houses: 160,
    houseCost: 50
  },
  3: {
    type: 'property',
    price: 60,
    rentWith1House: 20,
    rentWith2Houses: 60,
    rentWith3Houses: 180,
    rentWith4Houses: 320,
    houseCost: 50
  },

  // LIGHT BLUE COLOR GROUP (Oriental/Vermont/Connecticut equivalent)
  6: {
    type: 'property',
    price: 100,
    rentWith1House: 30,
    rentWith2Houses: 90,
    rentWith3Houses: 270,
    rentWith4Houses: 400,
    houseCost: 50
  },
  8: {
    type: 'property',
    price: 100,
    rentWith1House: 30,
    rentWith2Houses: 90,
    rentWith3Houses: 270,
    rentWith4Houses: 400,
    houseCost: 50
  },
  9: {
    type: 'property',
    price: 120,
    rentWith1House: 40,
    rentWith2Houses: 100,
    rentWith3Houses: 300,
    rentWith4Houses: 450,
    houseCost: 50
  },

  // PINK COLOR GROUP (St. Charles/States/Virginia equivalent)
  11: {
    type: 'property',
    price: 140,
    rentWith1House: 50,
    rentWith2Houses: 150,
    rentWith3Houses: 450,
    rentWith4Houses: 625,
    houseCost: 100
  },
  13: {
    type: 'property',
    price: 140,
    rentWith1House: 50,
    rentWith2Houses: 150,
    rentWith3Houses: 450,
    rentWith4Houses: 625,
    houseCost: 100
  },
  14: {
    type: 'property',
    price: 160,
    rentWith1House: 60,
    rentWith2Houses: 180,
    rentWith3Houses: 500,
    rentWith4Houses: 700,
    houseCost: 100
  },

  // ORANGE COLOR GROUP (St. James/Tennessee/New York equivalent)
  16: {
    type: 'property',
    price: 180,
    rentWith1House: 70,
    rentWith2Houses: 200,
    rentWith3Houses: 550,
    rentWith4Houses: 750,
    houseCost: 100
  },
  18: {
    type: 'property',
    price: 180,
    rentWith1House: 70,
    rentWith2Houses: 200,
    rentWith3Houses: 550,
    rentWith4Houses: 750,
    houseCost: 100
  },
  19: {
    type: 'property',
    price: 200,
    rentWith1House: 80,
    rentWith2Houses: 220,
    rentWith3Houses: 600,
    rentWith4Houses: 800,
    houseCost: 100
  },

  // RED COLOR GROUP (Kentucky/Indiana/Illinois equivalent)
  21: {
    type: 'property',
    price: 220,
    rentWith1House: 90,
    rentWith2Houses: 250,
    rentWith3Houses: 700,
    rentWith4Houses: 875,
    houseCost: 150
  },
  23: {
    type: 'property',
    price: 220,
    rentWith1House: 90,
    rentWith2Houses: 250,
    rentWith3Houses: 700,
    rentWith4Houses: 875,
    houseCost: 150
  },
  24: {
    type: 'property',
    price: 240,
    rentWith1House: 100,
    rentWith2Houses: 300,
    rentWith3Houses: 750,
    rentWith4Houses: 925,
    houseCost: 150
  },

  // YELLOW COLOR GROUP (Atlantic/Ventnor/Marvin Gardens equivalent)
  26: {
    type: 'property',
    price: 260,
    rentWith1House: 110,
    rentWith2Houses: 330,
    rentWith3Houses: 800,
    rentWith4Houses: 975,
    houseCost: 150
  },
  27: {
    type: 'property',
    price: 260,
    rentWith1House: 110,
    rentWith2Houses: 330,
    rentWith3Houses: 800,
    rentWith4Houses: 975,
    houseCost: 150
  },
  29: {
    type: 'property',
    price: 280,
    rentWith1House: 120,
    rentWith2Houses: 360,
    rentWith3Houses: 850,
    rentWith4Houses: 1025,
    houseCost: 150
  },

  // GREEN COLOR GROUP (Pacific/North Carolina/Pennsylvania equivalent)
  31: {
    type: 'property',
    price: 300,
    rentWith1House: 130,
    rentWith2Houses: 390,
    rentWith3Houses: 900,
    rentWith4Houses: 1100,
    houseCost: 200
  },
  32: {
    type: 'property',
    price: 300,
    rentWith1House: 130,
    rentWith2Houses: 390,
    rentWith3Houses: 900,
    rentWith4Houses: 1100,
    houseCost: 200
  },
  34: {
    type: 'property',
    price: 320,
    rentWith1House: 150,
    rentWith2Houses: 450,
    rentWith3Houses: 1000,
    rentWith4Houses: 1200,
    houseCost: 200
  },

  // DARK BLUE COLOR GROUP (Park Place/Boardwalk equivalent)
  37: {
    type: 'property',
    price: 350,
    rentWith1House: 175,
    rentWith2Houses: 500,
    rentWith3Houses: 1100,
    rentWith4Houses: 1300,
    houseCost: 200
  },
  39: {
    type: 'property',
    price: 400,
    rentWith1House: 200,
    rentWith2Houses: 600,
    rentWith3Houses: 1400,
    rentWith4Houses: 1700,
    houseCost: 200
  },

  // RAILROADS (4 total)
  5: { type: 'railroad' },
  15: { type: 'railroad' },
  25: { type: 'railroad' },
  35: { type: 'railroad' },

  // UTILITIES (3 total - modified from standard Monopoly)
  12: { type: 'utility' },
  22: { type: 'utility' },
  28: { type: 'utility' }
} as const

// ==================== UTILITY FUNCTIONS ====================

/**
 * Check if a position contains a property space
 */
export function isPropertySpace(position: number): boolean {
  const space = MONOPOLY_BOARD_SPACES[position]
  return space?.type === 'property'
}

/**
 * Check if a position contains a railroad
 */
export function isRailroadSpace(position: number): boolean {
  const space = MONOPOLY_BOARD_SPACES[position]
  return space?.type === 'railroad'
}

/**
 * Check if a position contains a utility
 */
export function isUtilitySpace(position: number): boolean {
  const space = MONOPOLY_BOARD_SPACES[position]
  return space?.type === 'utility'
}

/**
 * Get property space details or null if not a property
 */
export function getPropertySpace(position: number): PropertySpace | null {
  const space = MONOPOLY_BOARD_SPACES[position]
  return space?.type === 'property' ? space : null
}

/**
 * Get all property positions on the board
 */
export function getAllPropertyPositions(): number[] {
  return Object.keys(MONOPOLY_BOARD_SPACES).map(Number).filter(isPropertySpace)
}

/**
 * Get all railroad positions on the board
 */
export function getAllRailroadPositions(): number[] {
  return Object.keys(MONOPOLY_BOARD_SPACES).map(Number).filter(isRailroadSpace)
}

/**
 * Get all utility positions on the board
 */
export function getAllUtilityPositions(): number[] {
  return Object.keys(MONOPOLY_BOARD_SPACES).map(Number).filter(isUtilitySpace)
}
