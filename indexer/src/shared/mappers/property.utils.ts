import type { ColorGroup, PropertyType } from '#infra/db/schema'
import {
  MONOPOLY_BOARD_SPACES,
  getPropertySpace,
  isPropertySpace,
  isRailroadSpace,
  isUtilitySpace
} from '../config/board.config'

// ==================== PROPERTY PRICE UTILITIES ====================

/**
 * Get the default property price for a given board position
 *
 * @param position - Board position (0-39)
 * @returns Default property price or 100 if position not found
 */
export function getPropertyPrice(position: number): number {
  const space = getPropertySpace(position)
  return space?.price ?? 100
}

/**
 * Get all property prices as a lookup map
 *
 * @returns Map of position to property price
 */
export function getAllPropertyPrices(): Record<number, number> {
  const prices: Record<number, number> = {}

  for (const [position, space] of Object.entries(MONOPOLY_BOARD_SPACES)) {
    if (space.type === 'property') {
      prices[Number(position)] = space.price
    }
  }

  return prices
}

// ==================== COLOR GROUP UTILITIES ====================

/**
 * Determine the color group for a property at the given position
 *
 * @param position - Board position (0-39)
 * @returns ColorGroup enum value
 */
export function getPropertyColorGroup(position: number): ColorGroup {
  // Brown color group (cheapest properties)
  if ([1, 3].includes(position)) return 'Brown'

  // Light Blue color group
  if ([6, 8, 9].includes(position)) return 'LightBlue'

  // Pink color group
  if ([11, 13, 14].includes(position)) return 'Pink'

  // Orange color group
  if ([16, 18, 19].includes(position)) return 'Orange'

  // Red color group
  if ([21, 23, 24].includes(position)) return 'Red'

  // Yellow color group
  if ([26, 27, 29].includes(position)) return 'Yellow'

  // Green color group
  if ([31, 32, 34].includes(position)) return 'Green'

  // Dark Blue color group (most expensive properties)
  if ([37, 39].includes(position)) return 'DarkBlue'

  // Railroads
  if (isRailroadSpace(position)) return 'Railroad'

  // Utilities
  if (isUtilitySpace(position)) return 'Utility'

  // Default for special spaces
  return 'Special'
}

/**
 * Get all positions belonging to a specific color group
 *
 * @param colorGroup - The color group to search for
 * @returns Array of positions in that color group
 */
export function getPositionsInColorGroup(colorGroup: ColorGroup): number[] {
  return Object.keys(MONOPOLY_BOARD_SPACES)
    .map(Number)
    .filter((position) => getPropertyColorGroup(position) === colorGroup)
}

/**
 * Check if all properties in a color group are owned by the same player
 *
 * @param colorGroup - The color group to check
 * @param ownershipMap - Map of position to owner pubkey
 * @returns true if monopoly exists, false otherwise
 */
export function hasColorGroupMonopoly(colorGroup: ColorGroup, ownershipMap: Record<number, string>): boolean {
  const positions = getPositionsInColorGroup(colorGroup)

  if (positions.length === 0) return false

  const firstOwner = ownershipMap[positions[0]]
  if (!firstOwner) return false

  return positions.every((position) => ownershipMap[position] === firstOwner)
}

// ==================== PROPERTY TYPE UTILITIES ====================

/**
 * Determine the property type for a given board position
 *
 * @param position - Board position (0-39)
 * @returns PropertyType enum value
 */
export function getPropertyType(position: number): PropertyType {
  // Railroads
  if (isRailroadSpace(position)) return 'Railroad'

  // Utilities
  if (isUtilitySpace(position)) return 'Utility'

  // Corner spaces (GO, Jail, Free Parking, Go to Jail)
  if ([0, 10, 20, 30].includes(position)) return 'Corner'

  // Chance spaces
  if ([7, 22, 36].includes(position)) return 'Chance'

  // Community Chest spaces
  if ([2, 17, 33].includes(position)) return 'CommunityChest'

  // Tax spaces (Income Tax, Luxury Tax)
  if ([4, 38].includes(position)) return 'Tax'

  // Default to Street for regular properties
  return 'Street'
}

// ==================== RENT CALCULATION UTILITIES ====================

/**
 * Calculate base rent for a property (no houses, no monopoly)
 *
 * @param position - Board position
 * @returns Base rent amount
 */
export function getBaseRent(position: number): number {
  return Math.floor(getPropertyPrice(position) * 0.1)
}

/**
 * Calculate rent with color group monopoly bonus (double base rent)
 *
 * @param position - Board position
 * @returns Monopoly rent amount (without houses)
 */
export function getMonopolyRent(position: number): number {
  return getBaseRent(position) * 2
}

/**
 * Get house cost for building on a property
 *
 * @param position - Board position
 * @returns Cost to build one house, or 0 if no houses allowed
 */
export function getHouseCost(position: number): number {
  const space = getPropertySpace(position)
  return space?.houseCost ?? 0
}

/**
 * Get rent amounts for different house counts [1, 2, 3, 4 houses]
 *
 * @param position - Board position
 * @returns Array of rent for 1-4 houses, or [0,0,0,0] if no houses allowed
 */
export function getRentWithHouses(position: number): [number, number, number, number] {
  const space = getPropertySpace(position)

  if (!space) return [0, 0, 0, 0]

  return [space.rentWith1House ?? 0, space.rentWith2Houses ?? 0, space.rentWith3Houses ?? 0, space.rentWith4Houses ?? 0]
}

/**
 * Calculate actual rent based on property state
 *
 * @param position - Board position
 * @param houseCount - Number of houses (0-4, 5 = hotel)
 * @param hasMonopoly - Whether owner has color group monopoly
 * @returns Calculated rent amount
 */
export function calculateRent(position: number, houseCount: number, hasMonopoly: boolean): number {
  if (houseCount > 0 && houseCount <= 4) {
    const rentWithHouses = getRentWithHouses(position)
    return rentWithHouses[houseCount - 1]
  }

  if (houseCount === 5) {
    // Hotel rent = 4 houses rent typically
    const rentWithHouses = getRentWithHouses(position)
    return rentWithHouses[3] // 4th house rent
  }

  // No houses - check for monopoly bonus
  return hasMonopoly ? getMonopolyRent(position) : getBaseRent(position)
}

// ==================== VALIDATION UTILITIES ====================

/**
 * Validate if a position is valid for building houses
 *
 * @param position - Board position
 * @returns true if houses can be built, false otherwise
 */
export function canBuildHouses(position: number): boolean {
  const space = getPropertySpace(position)
  return space !== null && (space.houseCost ?? 0) > 0
}

/**
 * Validate if a position allows property ownership
 *
 * @param position - Board position
 * @returns true if position can be owned, false otherwise
 */
export function canOwnProperty(position: number): boolean {
  return isPropertySpace(position) || isRailroadSpace(position) || isUtilitySpace(position)
}

/**
 * Get property development limits for a position
 *
 * @param position - Board position
 * @returns Object with max houses and hotel info
 */
export function getPropertyDevelopmentLimits(position: number): {
  maxHouses: number
  allowsHotel: boolean
  houseCost: number
} {
  if (!canBuildHouses(position)) {
    return { maxHouses: 0, allowsHotel: false, houseCost: 0 }
  }

  return {
    maxHouses: 4,
    allowsHotel: true,
    houseCost: getHouseCost(position)
  }
}
