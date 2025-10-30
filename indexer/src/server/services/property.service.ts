import type { PropertyState, NewPropertyState, ColorGroup, PropertyType } from '#infra/db/schema'
import type { DatabasePort } from '#infra/db/db.port'
import type { BaseService, QueryFilters, PaginationOptions, PaginatedResult } from './base.service'
import { ServiceError, EntityNotFoundError, DatabaseError } from './base.service'

export interface PropertyStateQueryFilters extends QueryFilters {
  readonly owner?: string
  readonly game?: string // game pubkey, not numeric gameId
  readonly gameId?: number // numeric game ID for convenience
  readonly colorGroup?: ColorGroup
  readonly propertyType?: PropertyType
  readonly isMortgaged?: boolean
  readonly position?: number
  readonly hasBuildings?: boolean
  readonly minPrice?: number
  readonly maxPrice?: number
  readonly minRent?: number
  readonly maxRent?: number
}

/**
 * PropertyState portfolio summary for ownership analysis
 */
export interface PropertyStatePortfolio {
  readonly _owner: string
  readonly totalProperties: number
  readonly totalValue: number
  readonly totalRentIncome: number
  readonly colorGroupMonopolies: ColorGroup[]
  readonly mortgagedProperties: number
  readonly buildingCounts: {
    readonly houses: number
    readonly hotels: number
  }
}

/**
 * Color group monopoly information
 */
export interface ColorGroupMonopoly {
  readonly colorGroup: ColorGroup
  readonly _owner: string
  readonly properties: PropertyState[]
  readonly isComplete: boolean
  readonly totalRent: number
  readonly canBuild: boolean
}

/**
 * PropertyState rent calculation result
 */
export interface RentCalculation {
  readonly baseRent: number
  readonly actualRent: number
  readonly hasMonopoly: boolean
  readonly buildingMultiplier: number
  readonly specialModifiers: string[]
}

/**
 * PropertyState service implementation
 * Encapsulates all property-related database operations
 */
export class PropertyService implements BaseService<PropertyState, NewPropertyState> {
  constructor(private readonly db: DatabasePort) {}

  /**
   * Create or update a property record
   * Maps directly to PropertyStateState blockchain account updates
   */
  async upsert(propertyData: NewPropertyState): Promise<void> {
    try {
      await this.db.upsertPropertyState(propertyData)
    } catch (error) {
      throw new DatabaseError(`Failed to upsert property ${propertyData.pubkey}`, error as Error)
    }
  }

  /**
   * Retrieve a property by its blockchain pubkey
   */
  async getByPubkey(pubkey: string): Promise<PropertyState | null> {
    try {
      return await this.db.getPropertyState(pubkey)
    } catch (error) {
      throw new DatabaseError(`Failed to get property ${pubkey}`, error as Error)
    }
  }

  /**
   * Query properties with advanced filtering and pagination
   */
  async query(
    filters: PropertyStateQueryFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<PropertyState>> {
    try {
      return await this.db.getPropertyStates(filters, pagination)
    } catch (error) {
      throw new DatabaseError('Failed to query properties', error as Error)
    }
  }

  /**
   * Get all properties with filtering and pagination
   * Alias for query method to match BaseService interface
   */
  async getAll(
    filters: PropertyStateQueryFilters = {},
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<PropertyState>> {
    return this.query(filters, pagination)
  }

  /**
   * Get property by board position and game pubkey
   */
  async getPropertyAtPosition(gamePubkey: string, position: number): Promise<PropertyState | null> {
    const filters: PropertyStateQueryFilters = { game: gamePubkey, position }
    const result = await this.query(filters, { limit: 1 })
    return result.data[0] ?? null
  }

  /**
   * Get all properties in a specific game by pubkey
   */
  async getPropertiesByGame(
    gamePubkey: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<PropertyState>> {
    const filters: PropertyStateQueryFilters = { game: gamePubkey }
    return this.query(filters, pagination)
  }

  /**
   * Get properties owned by a specific player
   */
  async getPropertiesByOwner(
    gamePubkey: string,
    _owner: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<PropertyState>> {
    const filters: PropertyStateQueryFilters = {
      game: gamePubkey,
      owner: _owner
    }
    return this.query(filters, pagination)
  }

  /**
   * Get properties by color group in a specific game
   */
  async getPropertiesByColorGroup(
    gamePubkey: string,
    colorGroup: ColorGroup,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<PropertyState>> {
    const filters: PropertyStateQueryFilters = {
      game: gamePubkey,
      colorGroup
    }
    return this.query(filters, pagination)
  }

  /**
   * Get available (unowned) properties in a game
   */
  async getAvailableProperties(
    gamePubkey: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<PropertyState>> {
    const filters: PropertyStateQueryFilters = {
      game: gamePubkey,
      owner: undefined // This might need custom logic in db adapter
    }
    return this.query(filters, pagination)
  }

  /**
   * Get mortgaged properties
   */
  async getMortgagedProperties(
    gamePubkey?: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<PropertyState>> {
    const filters: PropertyStateQueryFilters = {
      isMortgaged: true,
      ...(gamePubkey && { game: gamePubkey })
    }
    return this.query(filters, pagination)
  }

  /**
   * Get properties with buildings (houses/hotels)
   */
  async getPropertiesWithBuildings(
    gamePubkey?: string,
    pagination: PaginationOptions = {}
  ): Promise<PaginatedResult<PropertyState>> {
    const filters: PropertyStateQueryFilters = {
      hasBuildings: true,
      ...(gamePubkey && { game: gamePubkey })
    }
    return this.query(filters, pagination)
  }

  /**
   * Get property statistics for analytics
   */
  async getPropertyStats(gamePubkey: string): Promise<any> {
    try {
      // This would require aggregate queries
      // Implementation depends on database adapter capabilities
      throw new ServiceError('getPropertyStats not yet implemented - requires aggregate queries', 'NOT_IMPLEMENTED')
    } catch (error) {
      throw new DatabaseError('Failed to get property statistics', error as Error)
    }
  }

  /**
   * Get player's property portfolio summary
   */
  async getPlayerPortfolio(gamePubkey: string, _owner: string): Promise<PropertyStatePortfolio> {
    try {
      const properties = await this.getPropertiesByOwner(gamePubkey, _owner)

      const totalProperties = properties.total
      const totalValue = properties.data.reduce((sum, prop) => sum + (prop.price ?? 0), 0)
      const mortgagedProperties = properties.data.filter((prop) => prop.isMortgaged).length

      // Calculate building counts
      const buildingCounts = properties.data.reduce(
        (counts, prop) => ({
          houses: counts.houses + (prop.houses ?? 0),
          hotels: counts.hotels + (prop.hasHotel ? 1 : 0)
        }),
        { houses: 0, hotels: 0 }
      )

      // Determine color group monopolies
      const colorGroupMonopolies = await this.getPlayerMonopolies(gamePubkey, _owner)

      return {
        _owner,
        totalProperties,
        totalValue,
        totalRentIncome: 0, // Would need rent calculation logic
        colorGroupMonopolies: colorGroupMonopolies.map((m) => m.colorGroup),
        mortgagedProperties,
        buildingCounts
      }
    } catch (error) {
      throw new DatabaseError(`Failed to get property portfolio for owner ${_owner}`, error as Error)
    }
  }

  /**
   * Get color group monopolies for a player
   */
  async getPlayerMonopolies(gamePubkey: string, _owner: string): Promise<ColorGroupMonopoly[]> {
    try {
      // This would require complex grouping and monopoly detection logic
      // Implementation depends on business rules for each color group
      throw new ServiceError(
        'getPlayerMonopolies not yet implemented - requires monopoly detection logic',
        'NOT_IMPLEMENTED'
      )
    } catch (error) {
      throw new DatabaseError('Failed to get player monopolies', error as Error)
    }
  }

  /**
   * Calculate rent for a property based on current state
   */
  async calculateRent(propertyPubkey: string, gamePubkeyOverride?: string): Promise<RentCalculation> {
    try {
      const property = await this.getByPubkey(propertyPubkey)
      if (!property) {
        throw new EntityNotFoundError('PropertyState', propertyPubkey)
      }

      const baseRent = property.rentBase ?? 0
      let actualRent = baseRent
      let hasMonopoly = false
      let buildingMultiplier = 1
      const specialModifiers: string[] = []

      // Check for color group monopoly (requires game pubkey)
      if (property.owner && property.colorGroup) {
        const effectiveGamePubkey = gamePubkeyOverride ?? property.game
        if (effectiveGamePubkey) {
          const monopoly = await this.checkColorGroupMonopoly(property.owner, property.colorGroup, effectiveGamePubkey)
          if (monopoly) {
            hasMonopoly = true
            actualRent = property.rentWithColorGroup ?? baseRent * 2
            specialModifiers.push('Color group monopoly')
          }
        }
      }

      // Apply building multipliers
      const houses = property.houses ?? 0
      if (property.hasHotel) {
        actualRent = property.rentWithHotel ?? actualRent
        buildingMultiplier = property.rentWithHotel / baseRent
        specialModifiers.push('Hotel')
      } else if (houses > 0) {
        const rentWithHouses = property.rentWithHouses ?? [0, 0, 0, 0]
        actualRent = rentWithHouses[houses - 1] ?? actualRent
        buildingMultiplier = actualRent / baseRent
        specialModifiers.push(`${houses} house${houses > 1 ? 's' : ''}`)
      }

      // Handle mortgage status
      if (property.isMortgaged) {
        actualRent = 0
        specialModifiers.push('Mortgaged - no rent')
      }

      return {
        baseRent,
        actualRent,
        hasMonopoly,
        buildingMultiplier,
        specialModifiers
      }
    } catch (error) {
      throw new DatabaseError(`Failed to calculate rent for property ${propertyPubkey}`, error as Error)
    }
  }

  /**
   * Check if a player has a color group monopoly
   */
  async checkColorGroupMonopoly(_owner: string, colorGroup: ColorGroup, gamePubkey: string): Promise<boolean> {
    try {
      const colorGroupProperties = await this.getPropertiesByColorGroup(gamePubkey, colorGroup)

      // Check if all properties in the color group are owned by the same player
      const ownedByPlayer = colorGroupProperties.data.filter((prop) => prop.owner === _owner)

      return ownedByPlayer.length === colorGroupProperties.data.length && colorGroupProperties.data.length > 0
    } catch (error) {
      throw new DatabaseError(`Failed to check monopoly for ${colorGroup}`, error as Error)
    }
  }

  /**
   * Validate property state consistency
   * Business logic validation for property data integrity
   */
  validatePropertyState(property: PropertyState): string[] {
    const errors: string[] = []

    // Validate position range
    const position = property.position ?? 0
    if (position < 0 || position > 39) {
      errors.push('PropertyState position must be between 0 and 39')
    }

    // Validate price
    const price = property.price ?? 0
    if (price < 0) {
      errors.push('PropertyState price cannot be negative')
    }

    // Validate building state
    const houses = property.houses ?? 0
    const hasHotel = property.hasHotel ?? false

    if (houses < 0 || houses > 4) {
      errors.push('Houses count must be between 0 and 4')
    }

    if (hasHotel && houses > 0) {
      errors.push('PropertyState cannot have both hotel and houses')
    }

    // Validate rent structure
    const rentBase = property.rentBase ?? 0
    const rentWithColorGroup = property.rentWithColorGroup ?? 0
    const rentWithHotel = property.rentWithHotel ?? 0

    if (rentBase < 0) {
      errors.push('Base rent cannot be negative')
    }

    if (rentWithColorGroup < rentBase) {
      errors.push('Rent with color group should be >= base rent')
    }

    if (rentWithHotel < rentWithColorGroup) {
      errors.push('Hotel rent should be >= color group rent')
    }

    // Validate rent with houses array
    const rentWithHouses = property.rentWithHouses ?? [0, 0, 0, 0]
    if (rentWithHouses.length !== 4) {
      errors.push('Rent with houses array must have exactly 4 elements')
    }

    for (let i = 0; i < rentWithHouses.length; i++) {
      if (rentWithHouses[i] < 0) {
        errors.push(`Rent with ${i + 1} houses cannot be negative`)
      }
      if (i > 0 && rentWithHouses[i] < rentWithHouses[i - 1]) {
        errors.push(`Rent should increase with more houses`)
      }
    }

    // Validate costs
    const houseCost = property.houseCost ?? 0
    const mortgageValue = property.mortgageValue ?? 0

    if (houseCost < 0) {
      errors.push('House cost cannot be negative')
    }

    if (mortgageValue < 0) {
      errors.push('Mortgage value cannot be negative')
    }

    if (mortgageValue > price) {
      errors.push('Mortgage value should not exceed property price')
    }

    // Validate mortgage state vs rent collection
    if (property.isMortgaged && property.lastRentPaid > 0) {
      // This might be acceptable depending on business rules
      // errors.push('Mortgaged properties should not collect rent')
    }

    return errors
  }
}
