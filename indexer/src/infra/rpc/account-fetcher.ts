import { Connection, PublicKey, type Commitment } from '@solana/web3.js'
import { env } from '#config'
import { logger } from '#utils/logger'
import {
  getPropertyPrice,
  getPropertyColorGroup,
  getPropertyType,
  getBaseRent,
  getMonopolyRent,
  getRentWithHouses,
  getHouseCost
} from '#shared/mappers/property.utils'
import type { ColorGroup, PropertyType, TradeInfo, EmbeddedPropertyState, EmbeddedTradeState } from '#infra/db/schema'

export interface GameAccountData {
  gameId: number
  configId: string
  status: string
  currentPlayerIndex: number
  playersCount: number
  nextTradeId: number
  activeTrades: TradeInfo[]
  // Add more fields as needed from Rust GameState struct
}

export interface EnhancedGameData {
  gameId: number
  configId: string
  authority: string
  bump: number
  maxPlayers: number
  currentPlayers: number
  currentTurn: number
  housesRemaining: number
  hotelsRemaining: number
  nextTradeId: number
  activeTrades: TradeInfo[]
  trades?: EmbeddedTradeState[]
  gameStatus?: string
  players?: string[]
  bankBalance: number
  freeParkingPool: number
  winner?: string | null
  properties?: EmbeddedPropertyState[]
  slot?: number
  createdAt?: number
  turnStartedAt?: number
  timeLimit?: number | null
  startedAt?: number | null
  endedAt?: number | null
  gameEndTime?: number | null
  entryFee?: number
  tokenMint?: string | null
  tokenVault?: string | null
  totalPrizePool?: number
  prizeClaimed?: boolean
}

export interface EnhancedPlatformData {
  id: string
  authority: string
  feeVault: string
  totalGamesCreated: number
  nextGameId: number
  feeBasisPoints: number
}

export interface EnhancedPlayerData {
  wallet: string
  game: string
  cashBalance: number
  position: number
  inJail: boolean
  jailTurns: number
  doublesCount: number
  isBankrupt: boolean
  propertiesOwned: number[]
  getOutOfJailCards: number
  netWorth: number
  lastRentCollected: number
  festivalBoostTurns: number
  hasRolledDice: boolean
  lastDiceRoll: [number, number]
  needsPropertyAction: boolean
  pendingPropertyPosition: number | null
  needsChanceCard: boolean
  needsCommunityChestCard: boolean
  needsBankruptcyCheck: boolean
  needsSpecialSpaceAction: boolean
  pendingSpecialSpacePosition: number | null
  cardDrawnAt: number | null
  slot: number
}

export interface PlayerStateSnapshot {
  playerStatePubkey: string
  wallet: string
  data: EnhancedPlayerData
}

export interface PropertyStateSnapshot {
  propertyPubkey: string
  position: number
  data: EnhancedPropertyData
}

export interface EnhancedPropertyData {
  position: number
  game: string
  owner: string | null
  price: number
  colorGroup: ColorGroup
  propertyType: PropertyType
  houses: number
  hasHotel: boolean
  isMortgaged: boolean
  rentBase: number
  rentWithColorGroup: number
  rentWithHouses: [number, number, number, number]
  rentWithHotel: number
  houseCost: number
  mortgageValue: number
  lastRentPaid: number
  init: boolean
}
export interface PlatformConfigData {
  id: string
  admin: string
  totalGamesCreated: number
  isActive: boolean
  // Add more fields as needed from Rust PlatformConfig struct
}

type DecodedTradeInfoInternal = {
  id: number
  proposer: string
  receiver: string
  tradeType: number
  proposerMoney: bigint
  receiverMoney: bigint
  proposerProperty: number | null
  receiverProperty: number | null
  status: number
  createdAt: bigint
  expiresAt: bigint
}

type DecodedPropertyInfoInternal = {
  owner: string | null
  houses: number
  hasHotel: boolean
  isMortgaged: boolean
}

const TRADE_TYPE_MAP = ['MoneyOnly', 'PropertyOnly', 'MoneyForProperty', 'PropertyForMoney'] as const
type TradeTypeLiteral = (typeof TRADE_TYPE_MAP)[number]

const TRADE_STATUS_MAP = ['Pending', 'Accepted', 'Rejected', 'Cancelled', 'Expired'] as const
type TradeStatusLiteral = (typeof TRADE_STATUS_MAP)[number]

const DEFAULT_TRADE_TYPE: TradeTypeLiteral = TRADE_TYPE_MAP[0]
const DEFAULT_TRADE_STATUS: TradeStatusLiteral = TRADE_STATUS_MAP[0]
const TRADE_TYPE_FALLBACKS: TradeTypeLiteral[] = [...TRADE_TYPE_MAP]
const TRADE_STATUS_FALLBACKS: TradeStatusLiteral[] = [...TRADE_STATUS_MAP]

export const MIN_GAME_STATE_ACCOUNT_SIZE = 400

type DecodedGameStateAccount = {
  gameId: bigint
  configId: string
  authority: string
  bump: number
  maxPlayers: number
  currentPlayers: number
  currentTurn: number
  players: string[]
  gameStatus: 'WaitingForPlayers' | 'InProgress' | 'Finished'
  bankBalance: bigint
  freeParkingPool: bigint
  housesRemaining: number
  hotelsRemaining: number
  winner: string | null
  entryFee: bigint
  tokenMint: string | null
  tokenVault: string | null
  totalPrizePool: bigint
  prizeClaimed: boolean
  endConditionMet: boolean
  endReason: number | null
  activeTrades: DecodedTradeInfoInternal[]
  nextTradeId: number
  properties: DecodedPropertyInfoInternal[]
  createdAt: bigint
  startedAt: bigint | null
  endedAt: bigint | null
  gameEndTime: bigint | null
  turnStartedAt: bigint
  timeLimit: bigint | null
  totalPlayers: number
  activePlayers: number
}

function decodeGameStateAccountBuffer(
  data: Buffer,
  ctx?: { accountAddress?: string; slot?: number }
): DecodedGameStateAccount | null {
  if (data.length < MIN_GAME_STATE_ACCOUNT_SIZE) {
    logger.debug(
      { account: ctx?.accountAddress, size: data.length, slot: ctx?.slot },
      '⚠️ GameState account too small, skipping'
    )
    return null
  }
  try {
    let offset = 8
    const length = data.length

    const ensure = (size: number) => {
      if (offset + size > length) {
        throw new Error(`Insufficient data: need ${size}, remaining ${length - offset}`)
      }
    }

    const readU8 = () => {
      ensure(1)
      const value = data.readUInt8(offset)
      offset += 1
      return value
    }

    const readBool = () => readU8() === 1

    const readU32 = () => {
      ensure(4)
      const value = data.readUInt32LE(offset)
      offset += 4
      return value
    }

    const readU64 = () => {
      ensure(8)
      const value = data.readBigUInt64LE(offset)
      offset += 8
      return value
    }

    const readI64 = () => {
      ensure(8)
      const value = data.readBigInt64LE(offset)
      offset += 8
      return value
    }

    const readPubkey = () => {
      ensure(32)
      const pubkey = new PublicKey(data.subarray(offset, offset + 32)).toBase58()
      offset += 32
      return pubkey
    }

    const readOptionFlag = () => {
      const flag = readU8()
      if (flag !== 0 && flag !== 1) {
        console.warn(`Unexpected option flag ${flag}, treating as None`)
        return 0
      }
      return flag
    }

    const readOptionPubkey = () => {
      const flag = readOptionFlag()
      if (flag === 0) return null
      return readPubkey()
    }

    const readOptionU8 = () => {
      const flag = readOptionFlag()
      if (flag === 0) return null
      return readU8()
    }

    const readOptionI64 = () => {
      const flag = readOptionFlag()
      if (flag === 0) return null
      return readI64()
    }

    const gameId = readU64()
    const configId = readPubkey()
    const authority = readPubkey()
    const bump = readU8()
    const maxPlayersRaw = readU8()
    const currentPlayersStored = readU8()
    const currentTurnStored = readU8()

    const rawPlayersLength = readU32()
    const players: string[] = []
    for (let i = 0; i < rawPlayersLength; i++) {
      const player = readPubkey()
      if (i < 16) {
        players.push(player)
      }
    }

    const rawEliminatedLength = readU32()
    for (let i = 0; i < rawEliminatedLength; i++) {
      readBool()
    }

    const totalPlayers = readU8()
    const activePlayers = readU8()

    const statusByte = readU8()
    const gameStatus = statusByte === 1 ? 'InProgress' : statusByte === 2 ? 'Finished' : 'WaitingForPlayers'

    const bankBalance = readU64()
    const freeParkingPool = readU64()
    const housesRemaining = readU8()
    const hotelsRemaining = readU8()
    const winner = readOptionPubkey()
    const entryFee = readU64()
    const tokenMint = readOptionPubkey()
    const tokenVault = readOptionPubkey()
    const totalPrizePool = readU64()
    const prizeClaimed = readBool()
    const endConditionMet = readBool()
    const endReason = readOptionU8()

    const rawTradesLength = readU32()
    const activeTrades: DecodedTradeInfoInternal[] = []
    for (let i = 0; i < rawTradesLength; i++) {
      const id = readU8()
      const proposer = readPubkey()
      const receiver = readPubkey()
      const tradeType = readU8()
      const proposerMoney = readU64()
      const receiverMoney = readU64()
      const proposerProperty = readOptionU8()
      const receiverProperty = readOptionU8()
      const status = readU8()
      const createdAt = readI64()
      const expiresAt = readI64()

      activeTrades.push({
        id,
        proposer,
        receiver,
        tradeType,
        proposerMoney,
        receiverMoney,
        proposerProperty,
        receiverProperty,
        status,
        createdAt,
        expiresAt
      })
    }

    const nextTradeId = readU8()

    const properties: DecodedPropertyInfoInternal[] = []
    for (let i = 0; i < 40; i++) {
      const owner = readOptionPubkey()
      const houses = readU8()
      const hasHotel = readBool()
      const isMortgaged = readBool()
      properties.push({
        owner,
        houses,
        hasHotel,
        isMortgaged
      })
    }

    const createdAt = readI64()
    const startedAt = readOptionI64()
    const endedAt = readOptionI64()
    const gameEndTime = readOptionI64()
    const turnStartedAt = readI64()
    const timeLimit = readOptionI64()

    const maxPlayers = Math.min(Math.max(maxPlayersRaw, 2), 16)
    const playersOutput = players.slice(0, maxPlayers)
    const currentPlayers = Math.min(Math.max(currentPlayersStored, playersOutput.length), maxPlayers)
    const currentTurn = Math.min(currentTurnStored, Math.max(currentPlayers - 1, 0))

    return {
      gameId,
      configId,
      authority,
      bump,
      maxPlayers,
      currentPlayers,
      currentTurn,
      players: playersOutput,
      gameStatus: gameStatus as DecodedGameStateAccount['gameStatus'],
      bankBalance,
      freeParkingPool,
      housesRemaining,
      hotelsRemaining,
      winner,
      entryFee,
      tokenMint,
      tokenVault,
      totalPrizePool,
      prizeClaimed,
      endConditionMet,
      endReason,
      activeTrades,
      nextTradeId,
      properties,
      createdAt,
      startedAt,
      endedAt,
      gameEndTime,
      turnStartedAt,
      timeLimit,
      totalPlayers,
      activePlayers
    }
  } catch (error) {
    logger.debug(
      {
        account: ctx?.accountAddress,
        size: data.length,
        error: error instanceof Error ? error.message : String(error)
      },
      '⚠️ Error decoding GameState account'
    )
    return null
  }
}

function toTradeInfoFromDecoded(trade: DecodedTradeInfoInternal): TradeInfo {
  const tradeType = TRADE_TYPE_FALLBACKS[trade.tradeType] ?? DEFAULT_TRADE_TYPE
  const status = TRADE_STATUS_FALLBACKS[trade.status] ?? DEFAULT_TRADE_STATUS

  return {
    id: trade.id,
    proposer: trade.proposer,
    receiver: trade.receiver,
    tradeType,
    proposerMoney: Number(trade.proposerMoney),
    receiverMoney: Number(trade.receiverMoney),
    proposerProperty: trade.proposerProperty,
    receiverProperty: trade.receiverProperty,
    status,
    createdAt: Number(trade.createdAt),
    expiresAt: Number(trade.expiresAt)
  }
}

function toEmbeddedTrade(game: string, trade: TradeInfo): EmbeddedTradeState {
  return {
    pubkey: `${game}-trade-${trade.id}`,
    game,
    proposer: trade.proposer,
    receiver: trade.receiver,
    tradeType: trade.tradeType,
    proposerMoney: trade.proposerMoney,
    receiverMoney: trade.receiverMoney,
    proposerProperty: trade.proposerProperty,
    receiverProperty: trade.receiverProperty,
    status: trade.status,
    createdAt: trade.createdAt,
    expiresAt: trade.expiresAt,
    bump: 0
  }
}

export function buildEnhancedGameDataFromBuffer(
  data: Buffer,
  gameAccountAddress: string,
  slot = 0
): EnhancedGameData | null {
  const decoded = decodeGameStateAccountBuffer(data, { accountAddress: gameAccountAddress, slot })
  if (!decoded) return null

  const activeTrades = decoded.activeTrades.map(toTradeInfoFromDecoded)
  const embeddedTrades: EmbeddedTradeState[] = activeTrades.map((trade) => toEmbeddedTrade(gameAccountAddress, trade))

  const properties: EmbeddedPropertyState[] = decoded.properties.map((property, idx) => {
    const price = getPropertyPrice(idx)
    const colorGroup = getPropertyColorGroup(idx) as ColorGroup
    const propertyType = getPropertyType(idx) as PropertyType
    const rentWithHouses = getRentWithHouses(idx) as [number, number, number, number]

    return {
      pubkey: `${gameAccountAddress}-property-${idx}`,
      game: gameAccountAddress,
      position: idx,
      owner: property.owner,
      price,
      colorGroup,
      propertyType,
      houses: property.houses,
      hasHotel: property.hasHotel,
      isMortgaged: property.isMortgaged,
      rentBase: getBaseRent(idx),
      rentWithColorGroup: getMonopolyRent(idx),
      rentWithHouses,
      rentWithHotel: rentWithHouses[3],
      houseCost: getHouseCost(idx),
      mortgageValue: Math.floor(price / 2),
      lastRentPaid: Date.now(),
      init: property.owner !== null || property.houses > 0 || property.hasHotel
    }
  })

  return {
    gameId: Number(decoded.gameId),
    configId: decoded.configId,
    authority: decoded.authority,
    bump: decoded.bump,
    maxPlayers: decoded.maxPlayers,
    currentPlayers: decoded.currentPlayers,
    currentTurn: decoded.currentTurn,
    housesRemaining: decoded.housesRemaining,
    hotelsRemaining: decoded.hotelsRemaining,
    nextTradeId: decoded.nextTradeId,
    activeTrades,
    trades: embeddedTrades,
    gameStatus: decoded.gameStatus,
    players: decoded.players,
    bankBalance: Number(decoded.bankBalance),
    freeParkingPool: Number(decoded.freeParkingPool),
    winner: decoded.winner,
    properties,
    createdAt: Number(decoded.createdAt),
    turnStartedAt: Number(decoded.turnStartedAt),
    timeLimit: decoded.timeLimit !== null ? Number(decoded.timeLimit) : null,
    startedAt: decoded.startedAt !== null ? Number(decoded.startedAt) : null,
    endedAt: decoded.endedAt !== null ? Number(decoded.endedAt) : null,
    gameEndTime: decoded.gameEndTime !== null ? Number(decoded.gameEndTime) : null,
    // Fee-related fields
    entryFee: Number(decoded.entryFee || 0n),
    tokenMint: decoded.tokenMint,
    tokenVault: decoded.tokenVault,
    totalPrizePool: Number(decoded.totalPrizePool || 0n),
    prizeClaimed: decoded.prizeClaimed ?? false,
    slot
  }
}

export class BlockchainAccountFetcher {
  private connection: Connection

  constructor() {
    // Use the same RPC endpoint as the indexer
    this.connection = new Connection(env.rpc.er.http)
  }

  private getCommitment(): Commitment {
    const commitment = env.solana.commitment as Commitment | undefined
    return commitment ?? 'confirmed'
  }

  /**
   * Fetch GameState account data and parse gameId
   */
  async fetchGameAccountData(gameAccountAddress: string): Promise<GameAccountData | null> {
    try {
      const pubkey = new PublicKey(gameAccountAddress)
      const accountInfo = await this.connection.getAccountInfo(pubkey)

      if (!accountInfo || !accountInfo.data) {
        console.warn(`🔍 No account data found for game: ${gameAccountAddress}`)
        return null
      }

      const data = accountInfo.data
      const decoded = decodeGameStateAccountBuffer(data, { accountAddress: gameAccountAddress })

      if (!decoded) {
        console.warn(`⚠️ Could not decode GameState account ${gameAccountAddress}`)
        return null
      }

      const activeTrades = decoded.activeTrades.map(toTradeInfoFromDecoded)

      console.log(`🎮 Fetched actual gameId ${decoded.gameId} from blockchain account ${gameAccountAddress}`)

      return {
        gameId: Number(decoded.gameId),
        configId: decoded.configId,
        status: decoded.gameStatus,
        currentPlayerIndex: decoded.currentTurn,
        playersCount: decoded.players.length,
        nextTradeId: decoded.nextTradeId,
        activeTrades
      }
    } catch (error) {
      console.error(`❌ Error fetching game account data for ${gameAccountAddress}:`, error)
      return null
    }
  }

  /**
   * Fetch PlatformConfig account data
   */
  async fetchPlatformConfigData(configAddress: string): Promise<PlatformConfigData | null> {
    try {
      const pubkey = new PublicKey(configAddress)
      const accountInfo = await this.connection.getAccountInfo(pubkey)

      if (!accountInfo || !accountInfo.data) {
        console.warn(`🔍 No platform config data found for: ${configAddress}`)
        return null
      }

      const data = accountInfo.data

      // Parse platform config from account data
      const totalGamesCreated = this.parseTotalGamesFromAccountData(data)

      console.log(`⚙️ Fetched platform config with totalGamesCreated: ${totalGamesCreated}`)

      return {
        id: configAddress,
        admin: 'parsed-admin', // Parse from data
        totalGamesCreated,
        isActive: true
      }
    } catch (error) {
      console.error(`❌ Error fetching platform config data for ${configAddress}:`, error)
      return null
    }
  }
  /**
   * Enhanced PlatformConfig parsing with all critical fields
   */
  async fetchEnhancedPlatformData(configAddress: string): Promise<EnhancedPlatformData | null> {
    try {
      const pubkey = new PublicKey(configAddress)
      const accountInfo = await this.connection.getAccountInfo(pubkey)

      if (!accountInfo?.data) {
        console.warn(`🔍 No platform config data found: ${configAddress}`)
        return null
      }

      const data = accountInfo.data
      console.log(`🔍 Enhanced parsing PlatformConfig from ${data.length} bytes`)

      // PlatformConfig layout: discriminator(8) + id(32) + fee_basis_points(2) + authority(32) + fee_vault(32) + total_games_created(8) + next_game_id(8)
      const id = this.parsePubkeyAtOffset(data, 8) // id field
      // Get platformFee (feeBasisPoints)
      const platformFee = this.parseU16AtOffset(data, 40) || 0 // fee_basis_points after id

      // Validate platformFee against PostgreSQL smallint range (-32768 to 32767)
      let feeBasisPoints
      if (platformFee > 32767) {
        console.warn(`platformFee value ${platformFee} is out of PostgreSQL smallint range, using fallback`)
        feeBasisPoints = 300 // Default to 3%
      } else {
        feeBasisPoints = platformFee
      }

      const authority = this.parsePubkeyAtOffset(data, 42) // authority after fee_basis_points
      const feeVault = this.parsePubkeyAtOffset(data, 74) // fee_vault follows authority

      // Validate total games
      const rawTotalGames = this.parseU64AtOffset(data, 106) || 0
      let totalGamesCreated = 0
      if (rawTotalGames > Number(9223372036854775807n)) {
        console.warn(`totalGames value ${rawTotalGames} is out of PostgreSQL bigint range, using fallback`)
        totalGamesCreated = 0
      } else {
        totalGamesCreated = rawTotalGames
      }

      // Validate nextGameId
      const rawNextGameId = this.parseU64AtOffset(data, 114) || 0
      let nextGameId = 0
      if (rawNextGameId > Number(9223372036854775807n)) {
        console.warn(`nextGameId value ${rawNextGameId} is out of PostgreSQL bigint range, using fallback`)
        nextGameId = 0
      } else {
        nextGameId = rawNextGameId
      }

      const resolvedId = id || configAddress
      const resolvedAuthority = authority || resolvedId
      const resolvedFeeVault = feeVault || resolvedAuthority

      return {
        id: resolvedId,
        authority: resolvedAuthority,
        feeVault: resolvedFeeVault,
        totalGamesCreated,
        nextGameId,
        feeBasisPoints
      }
    } catch (error) {
      console.error(`❌ Error fetching enhanced platform data:`, error)
      return null
    }
  }

  /**
   * Parse totalGamesCreated from platform config account data
   */
  private parseTotalGamesFromAccountData(data: Buffer): number {
    try {
      // Use enhanced method for better accuracy
      const totalGames = this.parseU64AtOffset(data, 106)
      if (totalGames === null || totalGames > Number(9223372036854775807n)) {
        console.warn(`totalGames value ${totalGames} is out of PostgreSQL bigint range, using fallback`)
        return 0
      }
      return totalGames
    } catch {
      return 0
    }
  } /**
   * Helper methods for parsing different data types at specific offsets
   */
  private parsePubkeyAtOffset(data: Buffer, offset: number): string | null {
    try {
      if (data.length >= offset + 32) {
        const keyBytes = data.subarray(offset, offset + 32)
        if (keyBytes.some((byte) => byte !== 0)) {
          return new PublicKey(keyBytes).toBase58()
        }
      }
      return null
    } catch {
      return null
    }
  }

  private parseU16AtOffset(data: Buffer, offset: number): number | null {
    try {
      if (data.length >= offset + 2) {
        return data.readUInt16LE(offset)
      }
      return null
    } catch {
      return null
    }
  }

  private parseU64AtOffset(data: Buffer, offset: number): number | null {
    try {
      if (data.length >= offset + 8) {
        const value = data.readBigUInt64LE(offset)
        // Kiểm tra giới hạn của PostgreSQL bigint (0 to 9223372036854775807)
        if (value < 9223372036854775807n) {
          return Number(value)
        }
        return null
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * Enhanced PlayerState parsing for missing fields
   */
  async fetchEnhancedPlayerData(playerAccountAddress: string): Promise<EnhancedPlayerData | null> {
    try {
      const pubkey = new PublicKey(playerAccountAddress)
      const accountResponse = await this.connection.getAccountInfoAndContext(pubkey)
      const accountInfo = accountResponse?.value

      if (!accountInfo?.data) {
        console.warn(`🔍 No player data found: ${playerAccountAddress}`)
        return null
      }

      const data = accountInfo.data as Buffer
      const slot = accountResponse?.context?.slot ?? 0
      console.log(`🔍 Enhanced parsing PlayerState from ${data.length} bytes (slot ${slot})`)

      return this.decodePlayerStateAccount(data, slot, playerAccountAddress)
    } catch (error) {
      console.error(`❌ Error fetching enhanced player data:`, error)
      return null
    }
  }

  async fetchPlayerStateSnapshots(
    gameAccountAddress: string,
    playerWallets: readonly string[]
  ): Promise<PlayerStateSnapshot[]> {
    const snapshots: PlayerStateSnapshot[] = []

    if (!playerWallets || playerWallets.length === 0) {
      return snapshots
    }

    try {
      const gamePubkey = new PublicKey(gameAccountAddress)
      const programId = new PublicKey(env.solana.programId)
      const uniqueWallets = Array.from(new Set(playerWallets.filter((wallet) => wallet && wallet !== 'UNKNOWN')))

      if (uniqueWallets.length === 0) {
        return snapshots
      }

      const derivedEntries: Array<{ wallet: string; playerPda: PublicKey }> = []
      for (const wallet of uniqueWallets) {
        try {
          const walletKey = new PublicKey(wallet)
          const [playerPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('player'), gamePubkey.toBuffer(), walletKey.toBuffer()],
            programId
          )
          derivedEntries.push({ wallet, playerPda })
        } catch (error) {
          console.warn(`⚠️ Failed to derive player PDA for wallet ${wallet}:`, error)
        }
      }

      if (derivedEntries.length === 0) {
        return snapshots
      }

      const commitment = this.getCommitment()
      const accountInfos = await this.connection.getMultipleAccountsInfo(
        derivedEntries.map((entry) => entry.playerPda),
        commitment
      )

      const slot = await this.connection.getSlot(commitment)

      derivedEntries.forEach((entry, idx) => {
        const accountInfo = accountInfos?.[idx]
        if (!accountInfo?.data) return

        const decoded = this.decodePlayerStateAccount(accountInfo.data as Buffer, slot, entry.playerPda.toBase58())
        if (!decoded) return

        snapshots.push({
          playerStatePubkey: entry.playerPda.toBase58(),
          wallet: decoded.wallet,
          data: decoded
        })
      })
    } catch (error) {
      console.error(`❌ Failed to fetch player snapshots for game ${gameAccountAddress}:`, error)
    }

    return snapshots
  }

  private decodePlayerStateAccount(data: Buffer, slot: number, accountAddress?: string): EnhancedPlayerData | null {
    try {
      const wallet = this.parsePubkeyAtOffset(data, 8) || 'UNKNOWN'
      const game = this.parsePubkeyAtOffset(data, 40) || 'UNKNOWN'
      const cashBalanceRaw = this.parseU64AtOffset(data, 72) || 0
      const position = Math.min(this.parseByteAtOffset(data, 80) || 0, 39)
      const inJail = this.parseBoolAtOffset(data, 81) || false
      const jailTurns = Math.min(this.parseByteAtOffset(data, 82) || 0, 3)
      const doublesCount = Math.min(this.parseByteAtOffset(data, 83) || 0, 3)
      const isBankrupt = this.parseBoolAtOffset(data, 84) || false
      const validCashBalance = cashBalanceRaw > Number.MAX_SAFE_INTEGER ? 1_500_000 : cashBalanceRaw

      let currentOffset = 85

      const rawPropertiesLength = this.parseU32AtOffset(data, currentOffset) || 0
      currentOffset += 4

      let propertiesLength = Math.min(rawPropertiesLength, 40)
      if (rawPropertiesLength > 40) {
        console.warn(
          `Large properties array length ${rawPropertiesLength} exceeds limit, truncating to 40 for ${accountAddress}`
        )
      }

      const remainingBytes = data.length - currentOffset
      if (propertiesLength > remainingBytes) {
        console.warn(
          `Invalid properties array: length=${propertiesLength}, remaining_bytes=${remainingBytes} for ${accountAddress}`
        )
        propertiesLength = remainingBytes
      }

      const propertiesOwned: number[] = []
      for (let i = 0; i < propertiesLength && i < 50; i++) {
        const propertyPos = this.parseByteAtOffset(data, currentOffset + i) || 0
        if (propertyPos > 0 && propertyPos <= 39) {
          propertiesOwned.push(propertyPos)
        }
      }
      currentOffset += propertiesLength

      const getOutOfJailCards = this.parseByteAtOffset(data, currentOffset) || 0
      currentOffset += 1

      const netWorth = this.parseU64AtOffset(data, currentOffset) || validCashBalance
      currentOffset += 8

      const lastRentCollected = this.parseI64AtOffset(data, currentOffset) || Date.now()
      currentOffset += 8

      const festivalBoostTurns = this.parseByteAtOffset(data, currentOffset) || 0
      currentOffset += 1

      const hasRolledDice = this.parseBoolAtOffset(data, currentOffset) || false
      currentOffset += 1

      const lastDiceRoll: [number, number] = [
        this.parseByteAtOffset(data, currentOffset) || 0,
        this.parseByteAtOffset(data, currentOffset + 1) || 0
      ]
      currentOffset += 2

      const needsPropertyAction = this.parseBoolAtOffset(data, currentOffset) || false
      currentOffset += 1

      const hasPendingProperty = this.parseBoolAtOffset(data, currentOffset) || false
      currentOffset += 1
      const pendingPropertyPosition = hasPendingProperty ? this.parseByteAtOffset(data, currentOffset) || null : null
      if (hasPendingProperty) currentOffset += 1

      const needsChanceCard = this.parseBoolAtOffset(data, currentOffset) || false
      currentOffset += 1

      const needsCommunityChestCard = this.parseBoolAtOffset(data, currentOffset) || false
      currentOffset += 1

      const needsBankruptcyCheck = this.parseBoolAtOffset(data, currentOffset) || false
      currentOffset += 1

      const needsSpecialSpaceAction = this.parseBoolAtOffset(data, currentOffset) || false
      currentOffset += 1

      const hasPendingSpecial = this.parseBoolAtOffset(data, currentOffset) || false
      currentOffset += 1
      const pendingSpecialSpacePosition = hasPendingSpecial ? this.parseByteAtOffset(data, currentOffset) || null : null
      if (hasPendingSpecial) currentOffset += 1

      const hasCardDrawn = this.parseBoolAtOffset(data, currentOffset) || false
      currentOffset += 1
      const cardDrawnAt = hasCardDrawn ? this.parseI64AtOffset(data, currentOffset) || null : null

      return {
        wallet,
        game,
        cashBalance: validCashBalance,
        position,
        inJail,
        jailTurns,
        doublesCount,
        isBankrupt,
        netWorth,
        propertiesOwned,
        getOutOfJailCards,
        lastRentCollected,
        festivalBoostTurns,
        hasRolledDice,
        lastDiceRoll,
        needsPropertyAction,
        pendingPropertyPosition,
        needsChanceCard,
        needsCommunityChestCard,
        needsBankruptcyCheck,
        needsSpecialSpaceAction,
        pendingSpecialSpacePosition,
        cardDrawnAt,
        slot
      }
    } catch (error) {
      console.error(`❌ Failed to decode PlayerState account ${accountAddress ?? 'unknown'}:`, error)
      return null
    }
  }

  async fetchPropertyStateSnapshots(
    gameAccountAddress: string,
    positions: readonly number[] = []
  ): Promise<PropertyStateSnapshot[]> {
    const snapshots: PropertyStateSnapshot[] = []
    const gamePubkey = new PublicKey(gameAccountAddress)
    const programId = new PublicKey(env.solana.programId)

    const normalizedPositions =
      positions.length > 0
        ? Array.from(new Set(positions.filter((pos) => Number.isInteger(pos) && pos >= 0 && pos < 40)))
        : Array.from({ length: 40 }, (_, idx) => idx)

    if (normalizedPositions.length === 0) {
      return snapshots
    }

    try {
      const derivedEntries: Array<{ position: number; propertyPda: PublicKey }> = []
      for (const position of normalizedPositions) {
        try {
          const [propertyPda] = PublicKey.findProgramAddressSync(
            [Buffer.from('property'), gamePubkey.toBuffer(), Buffer.from([position])],
            programId
          )
          derivedEntries.push({ position, propertyPda })
        } catch (error) {
          console.warn(
            {
              game: gameAccountAddress,
              position,
              error: error instanceof Error ? error.message : String(error)
            },
            '⚠️ Failed to derive property PDA'
          )
        }
      }

      if (derivedEntries.length === 0) {
        return snapshots
      }

      const commitment = this.getCommitment()
      const accountInfos = await this.connection.getMultipleAccountsInfo(
        derivedEntries.map((entry) => entry.propertyPda),
        commitment
      )

      derivedEntries.forEach((entry, idx) => {
        const accountInfo = accountInfos?.[idx]
        if (!accountInfo?.data) return

        const decoded = this.decodePropertyStateAccount(accountInfo.data as Buffer, entry.propertyPda.toBase58())
        if (!decoded) return

        snapshots.push({
          propertyPubkey: entry.propertyPda.toBase58(),
          position: entry.position,
          data: decoded
        })
      })
    } catch (error) {
      console.error(`❌ Failed to fetch property snapshots for game ${gameAccountAddress}:`, error)
    }

    return snapshots
  }

  /**
   * Enhanced PropertyState parsing for missing fields
   */
  async fetchEnhancedPropertyData(propertyAccountAddress: string): Promise<EnhancedPropertyData | null> {
    try {
      const pubkey = new PublicKey(propertyAccountAddress)
      const accountInfo = await this.connection.getAccountInfo(pubkey)

      if (!accountInfo?.data) {
        console.warn(`🔍 No property data found: ${propertyAccountAddress}`)
        return null
      }

      const data = accountInfo.data as Buffer
      console.log(`🔍 Enhanced parsing PropertyState from ${data.length} bytes`)

      return this.decodePropertyStateAccount(data, propertyAccountAddress)
    } catch (error) {
      console.error(`❌ Error fetching enhanced property data:`, error)
      return null
    }
  }

  private decodePropertyStateAccount(data: Buffer, accountAddress?: string): EnhancedPropertyData | null {
    try {
      const position = this.parseByteAtOffset(data, 8) ?? 0
      const game = this.parsePubkeyAtOffset(data, 9) || 'UNKNOWN'
      const owner = this.parseOptionalPubkeyAtOffset(data, 41)

      const defaultPrice = getPropertyPrice(position)
      const price = this.parseU16AtOffset(data, 74) || defaultPrice
      const defaultRentWithHouses = getRentWithHouses(position)
      const defaultRentBase = getBaseRent(position)
      const defaultRentWithColorGroup = getMonopolyRent(position)
      const defaultHouseCost = getHouseCost(position)

      const colorGroup = getPropertyColorGroup(position)
      const propertyType = getPropertyType(position)

      const houses = Math.min(this.parseByteAtOffset(data, 80) || 0, 4)
      const hasHotel = this.parseBoolAtOffset(data, 81) || false
      const isMortgaged = this.parseBoolAtOffset(data, 82) || false
      const rentBase = this.parseU16AtOffset(data, 83) || defaultRentBase
      const rentWithColorGroup = this.parseU16AtOffset(data, 85) || defaultRentWithColorGroup
      const rentWithHouses: [number, number, number, number] = [
        this.parseU16AtOffset(data, 87) || defaultRentWithHouses[0],
        this.parseU16AtOffset(data, 89) || defaultRentWithHouses[1],
        this.parseU16AtOffset(data, 91) || defaultRentWithHouses[2],
        this.parseU16AtOffset(data, 93) || defaultRentWithHouses[3]
      ]
      const rentWithHotel = this.parseU16AtOffset(data, 95) || rentWithHouses[3]
      const houseCost = this.parseU16AtOffset(data, 97) || defaultHouseCost
      const mortgageValue = this.parseU16AtOffset(data, 99) || Math.floor(price / 2)
      const lastRentPaid = this.parseI64AtOffset(data, 101) || Date.now()
      const init = this.parseBoolAtOffset(data, 109) || false

      return {
        position,
        game,
        owner,
        price,
        colorGroup,
        propertyType,
        houses,
        hasHotel,
        isMortgaged,
        rentBase,
        rentWithColorGroup,
        rentWithHouses,
        rentWithHotel,
        houseCost,
        mortgageValue,
        lastRentPaid,
        init
      }
    } catch (error) {
      console.error(`❌ Failed to decode PropertyState account ${accountAddress ?? 'unknown'}:`, error)
      return null
    }
  }

  /**
   * Decode GameState account using precise layout
   */
  /**
   * Helper methods for additional data types
   */
  private parseBoolAtOffset(data: Buffer, offset: number): boolean | null {
    try {
      if (offset < data.length) {
        return data.readUInt8(offset) !== 0
      }
      return null
    } catch {
      return null
    }
  }

  private parseOptionalPubkeyAtOffset(data: Buffer, offset: number): string | null {
    try {
      if (data.length >= offset + 33) {
        const hasValue = data.readUInt8(offset) !== 0
        if (hasValue) {
          const keyBytes = data.subarray(offset + 1, offset + 33)
          return new PublicKey(keyBytes).toBase58()
        }
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * Helper to parse Option<u8> at offset
   */
  private parseOptionalU8AtOffset(data: Buffer, offset: number): number | null {
    try {
      if (data.length >= offset + 2) {
        const hasValue = data.readUInt8(offset) !== 0
        if (hasValue) {
          return data.readUInt8(offset + 1)
        }
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * Enhanced GameState parsing with critical fields including game_status, all players, and trades
   */
  async fetchEnhancedGameData(gameAccountAddress: string): Promise<EnhancedGameData | null> {
    try {
      logger.debug(`🔍 Fetching account data for game: ${gameAccountAddress}`)
      const pubkey = new PublicKey(gameAccountAddress)

      // Enhanced retry logic for account data fetching with exponential backoff
      let accountResponse: Awaited<ReturnType<Connection['getAccountInfoAndContext']>> | null = null
      let retryCount = 0
      const maxRetries = 12 // Even more retries for blockchain timing
      const initialDelay = 5000 // Start with 5 seconds

      while (retryCount < maxRetries && !accountResponse?.value?.data) {
        try {
          logger.debug(
            `🔍 Attempt ${retryCount + 1}/${maxRetries} - Fetching account data for game: ${gameAccountAddress}`
          )
          accountResponse = await this.connection.getAccountInfoAndContext(pubkey)

          if (accountResponse?.value?.data && accountResponse.value.data.length > 0) {
            logger.debug(
              `✅ Enhanced parsing GameState from ${accountResponse.value.data.length} bytes for ${gameAccountAddress} (slot ${accountResponse.context.slot})`
            )
            break
          } else {
            logger.debug(`⚠️ Account data is empty or null on attempt ${retryCount + 1} for ${gameAccountAddress}`)
          }
        } catch (error: unknown) {
          logger.error(
            {
              error: error instanceof Error ? error.message : String(error),
              attempt: retryCount + 1,
              gameAccountAddress
            },
            '❌ Error fetching account data on attempt'
          )
        }

        retryCount++
        if (retryCount < maxRetries) {
          // Exponential backoff: 5s, 8s, 12s, 18s, 26s, 36s, 48s, 62s, 78s, 96s, 116s, 138s
          const exponentialDelay = initialDelay + Math.pow(retryCount, 2) * 1000
          const currentDelay = Math.min(exponentialDelay, 45000) // Cap at 45 seconds
          logger.debug(`🔄 Retrying in ${currentDelay}ms... (attempt ${retryCount + 1}/${maxRetries})`)
          await new Promise((resolve) => setTimeout(resolve, currentDelay))
        }
      }

      if (!accountResponse?.value?.data) {
        logger.debug(
          `⏳ Account not found after ${maxRetries} retries, this is normal for very new games: ${gameAccountAddress}`
        )
        return null // Account will be created in subsequent transactions
      }

      const data = accountResponse.value.data as Buffer
      const slot = accountResponse.context.slot ?? 0

      const enhanced = buildEnhancedGameDataFromBuffer(data, gameAccountAddress, slot)
      if (!enhanced) {
        logger.warn(`⚠️ Failed to decode GameState account ${gameAccountAddress}`)
        return null
      }

      logger.info(
        {
          pubkey: gameAccountAddress,
          createdAt: enhanced.createdAt,
          createdAtType: typeof enhanced.createdAt,
          startedAt: enhanced.startedAt,
          endedAt: enhanced.endedAt,
          gameEndTime: enhanced.gameEndTime,
          turnStartedAt: enhanced.turnStartedAt,
          timeLimit: enhanced.timeLimit,
          slot
        },
        '⏱️ Decoded time fields from blockchain buffer'
      )

      return enhanced
    } catch (error: unknown) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), gameAccountAddress },
        '❌ Error fetching enhanced game data'
      )
      return null
    }
  }

  /**
   * Helper to parse single byte at offset
   */
  private parseByteAtOffset(data: Buffer, offset: number): number | null {
    try {
      if (offset < data.length) {
        return data.readUInt8(offset)
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * Helper to parse u32 at offset (little endian)
   */
  private parseU32AtOffset(data: Buffer, offset: number): number | null {
    try {
      if (offset + 4 <= data.length) {
        return data.readUInt32LE(offset)
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * Helper to parse i64 at offset (little endian)
   */
  private parseI64AtOffset(data: Buffer, offset: number): number | null {
    try {
      if (offset + 8 <= data.length) {
        const value = data.readBigInt64LE(offset)
        // Kiểm tra giới hạn của PostgreSQL bigint (-9223372036854775808 to 9223372036854775807)
        if (value > -9223372036854775808n && value < 9223372036854775807n) {
          return Number(value)
        }
        return null
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * Parse activeTrades from game account data - CRITICAL for blockchain data integrity
   */
  private parseActiveTradesFromAccountData(data: Buffer): TradeInfo[] {
    try {
      if (data.length === 0) {
        console.log(`🔍 Empty account data - no trades to parse`)
        return []
      }

      // active_trades is a Vec<TradeInfo> in Rust - located after properties array
      // Calculate the offset to active_trades vector dynamically
      const propertiesStartOffset = this.calculatePropertiesOffset()
      const propertiesArraySize = 40 * 80 // 40 properties, ~80 bytes each (conservative estimate)
      const activeTradesOffset = propertiesStartOffset + propertiesArraySize

      if (data.length < activeTradesOffset + 4) {
        console.log(
          `🔍 Insufficient data for activeTrades parsing: need ${activeTradesOffset + 4}, have ${data.length} bytes`
        )
        return []
      }

      // Read vector length (u32)
      const tradesVectorLength = data.readUInt32LE(activeTradesOffset)
      console.log(`🔍 Found ${tradesVectorLength} active trades in blockchain data at offset ${activeTradesOffset}`)

      if (tradesVectorLength === 0) {
        return []
      }

      // Parse actual TradeInfo structs
      const trades: TradeInfo[] = []
      let currentOffset = activeTradesOffset + 4 // Skip vector length

      for (let i = 0; i < tradesVectorLength && i < 10; i++) {
        // Limit to max 10 trades for safety
        try {
          if (currentOffset + 100 > data.length) {
            // Estimate ~100 bytes per TradeInfo
            console.warn(`⚠️ Insufficient data for trade ${i} at offset ${currentOffset}`)
            break
          }

          // Parse TradeInfo struct according to actual schema
          const tradeId = this.parseByteAtOffset(data, currentOffset) || 0 // u8 id
          const proposer = this.parsePubkeyAtOffset(data, currentOffset + 1) || 'UNKNOWN' // Pubkey proposer
          const receiver = this.parsePubkeyAtOffset(data, currentOffset + 33) || 'UNKNOWN' // Pubkey receiver
          const tradeType = this.parseByteAtOffset(data, currentOffset + 65) || 0 // TradeType enum
          const proposerMoney = this.parseU64AtOffset(data, currentOffset + 66) || 0 // u64
          const receiverMoney = this.parseU64AtOffset(data, currentOffset + 74) || 0 // u64
          const proposerProperty = this.parseOptionalU8AtOffset(data, currentOffset + 82) // Option<u8>
          const receiverProperty = this.parseOptionalU8AtOffset(data, currentOffset + 84) // Option<u8>
          const status = this.parseByteAtOffset(data, currentOffset + 86) || 0 // TradeStatus enum
          const createdAt = this.parseI64AtOffset(data, currentOffset + 87) || Date.now() // i64
          const expiresAt = this.parseI64AtOffset(data, currentOffset + 95) || Date.now() + 86400000 // i64

          const decodedTrade: DecodedTradeInfoInternal = {
            id: tradeId,
            proposer,
            receiver,
            tradeType,
            proposerMoney: BigInt(proposerMoney),
            receiverMoney: BigInt(receiverMoney),
            proposerProperty,
            receiverProperty,
            status,
            createdAt: BigInt(createdAt),
            expiresAt: BigInt(expiresAt)
          }

          const trade = toTradeInfoFromDecoded(decodedTrade)

          trades.push(trade)
          currentOffset += 100 // Estimated TradeInfo size - adjust based on actual struct

          console.log(
            `📋 Parsed trade ${i + 1}: ID=${tradeId}, proposer=${proposer.slice(0, 8)}, status=${trade.status}`
          )
        } catch (tradeError) {
          console.error(`❌ Error parsing trade ${i}:`, tradeError)
          break // Stop parsing on error to avoid corruption
        }
      }

      console.log(`✅ Successfully parsed ${trades.length} trades from blockchain data`)
      return trades
    } catch (error) {
      console.error('❌ Error parsing activeTrades from account data:', error)
      return [] // Return empty array on error, but log for debugging
    }
  }

  /**
   * Parse properties array from GameState account data
   */
  private parsePropertiesFromAccountData(
    data: Buffer,
    playersCount: number
  ): Array<{
    pubkey: string
    game?: string
    position: number
    owner: string | null
    price: number
    colorGroup: ColorGroup
    propertyType: PropertyType
    houses: number
    hasHotel: boolean
    isMortgaged: boolean
    rentBase: number
    rentWithColorGroup: number
    rentWithHouses: [number, number, number, number]
    rentWithHotel: number
    houseCost: number
    mortgageValue: number
    lastRentPaid: number
    init: boolean
  }> {
    try {
      // Properties array [PropertyInfo; 40] starts after all the variable-length fields
      // This is a complex calculation since we need to account for:
      // - Fixed fields up to players vector
      // - Players vector (variable length)
      // - PlayerEliminated vector (variable length)
      // - Other fields before properties

      const propertiesOffset = this.calculatePropertiesOffset() + playersCount * 33 // Account for players vector
      console.log(`🔍 Calculating properties offset: ${propertiesOffset} for ${playersCount} players`)

      const properties = []

      // Each PropertyInfo is roughly:
      // position(1) + game(32) + owner(33) + price(2) + color_group(1) + property_type(1) +
      // houses(1) + has_hotel(1) + is_mortgaged(1) + other fields...
      // Validate total size
      const propertyInfoSize = 80 // Approximate size
      const totalPropertiesSize = 40 * propertyInfoSize

      // Validate remaining buffer size
      if (propertiesOffset + totalPropertiesSize > data.length) {
        console.warn(
          'Large or invalid properties array: length=40, remaining_bytes=' + (data.length - propertiesOffset)
        )
        throw new Error('Invalid properties array: length=40, remaining_bytes=' + (data.length - propertiesOffset))
      }

      for (let i = 0; i < 40; i++) {
        // Fixed 40 properties
        const propertyOffset = propertiesOffset + i * propertyInfoSize

        // Validate individual property offset
        if (propertyOffset + propertyInfoSize > data.length) {
          console.warn('Invalid property offset ' + i + ': ' + propertyOffset + ' exceeds buffer length ' + data.length)
          continue
        }

        // Parse property values with validation
        let position = this.parseByteAtOffset(data, propertyOffset)
        if (position === null || position >= 40) position = i

        let owner = null
        try {
          owner = this.parseOptionalPubkeyAtOffset(data, propertyOffset + 33) // After game field
        } catch (error) {
          console.warn('Failed to parse owner for property ' + i + ':', error)
        }

        // Parse and validate numeric fields
        const houses = Math.min(this.parseByteAtOffset(data, propertyOffset + 70) || 0, 4) // Max 4 houses
        const hasHotel = this.parseBoolAtOffset(data, propertyOffset + 71) || false
        const isMortgaged = this.parseBoolAtOffset(data, propertyOffset + 72) || false

        // Get default values
        const price = getPropertyPrice(position)
        const colorGroup = getPropertyColorGroup(position)
        const propertyType = getPropertyType(position)
        const rentBase = getBaseRent(position)
        const rentWithColorGroup = getMonopolyRent(position)
        const rentWithHouses = getRentWithHouses(position)
        const houseCost = getHouseCost(position)
        const mortgageValue = Math.floor(price / 2)

        properties.push({
          pubkey: `property-${position}`, // Synthetic key for embedded property
          position,
          owner,
          price,
          colorGroup,
          propertyType,
          houses,
          hasHotel,
          isMortgaged,
          rentBase,
          rentWithColorGroup,
          rentWithHouses,
          rentWithHotel: rentWithHouses[3] * 2, // Estimate hotel rent
          houseCost,
          mortgageValue,
          lastRentPaid: Date.now(),
          init: true
        })
      }

      console.log(`🔍 Parsed ${properties.length} properties from blockchain data`)
      return properties
    } catch (error) {
      console.error('❌ Error parsing properties:', error)

      // Return default properties array if parsing fails
      const defaultProperties = []
      for (let i = 0; i < 40; i++) {
        const price = getPropertyPrice(i)
        const colorGroup = getPropertyColorGroup(i)
        const propertyType = getPropertyType(i)
        const rentBase = getBaseRent(i)
        const rentWithColorGroup = getMonopolyRent(i)
        const rentWithHouses = getRentWithHouses(i)
        const houseCost = getHouseCost(i)
        const mortgageValue = Math.floor(price / 2)

        defaultProperties.push({
          pubkey: `property-${i}`,
          position: i,
          owner: null,
          price,
          colorGroup,
          propertyType,
          houses: 0,
          hasHotel: false,
          isMortgaged: false,
          rentBase,
          rentWithColorGroup,
          rentWithHouses,
          rentWithHotel: rentWithHouses[3] * 2,
          houseCost,
          mortgageValue,
          lastRentPaid: Date.now(),
          init: true
        })
      }
      return defaultProperties
    }
  }

  /**
   * Calculate the offset where properties array starts in GameState
   */
  private calculatePropertiesOffset(): number {
    // This is a rough estimate - would need exact Borsh layout for precision
    // Base fields before properties array
    const baseOffset = 84 // discriminator + gameId + configId + creator + bump + max + current + current_turn
    const estimatedVariableFieldsSize = 200 // Rough estimate for players, eliminated, etc.
    return baseOffset + estimatedVariableFieldsSize
  }

  /**
   * Parse players vector from GameState account data
   */
  private parsePlayersVectorFromAccountData(data: Buffer, startOffset: number, maxEntries = 8): string[] {
    try {
      // Vec<Pubkey> in Rust - format: [length: u32] + [Pubkey items...]
      if (data.length < startOffset + 4) {
        return []
      }

      const rawVectorLength = data.readUInt32LE(startOffset)
      const vectorLength = Math.min(rawVectorLength, Math.max(0, maxEntries))
      const players: string[] = []

      let currentOffset = startOffset + 4
      for (let i = 0; i < vectorLength && currentOffset + 32 <= data.length; i++) {
        const pubkeyBytes = data.subarray(currentOffset, currentOffset + 32)
        const pubkey = new PublicKey(pubkeyBytes)
        players.push(pubkey.toBase58())
        currentOffset += 32
      }

      if (rawVectorLength > vectorLength) {
        console.warn(`Players vector length ${rawVectorLength} exceeds limit ${vectorLength}, clamping results`)
      }

      console.log(`🔍 Parsed ${players.length} players from blockchain data`)
      return players
    } catch (error) {
      console.error('❌ Error parsing players vector:', error)
      return []
    }
  }

  /**
   * Parse game status from GameState account data
   */
  private parseGameStatusFromAccountData(data: Buffer, playersCount: number): string {
    try {
      // GameStatus enum offset: after players vec + player_eliminated vec + total_players(1) + active_players(1)
      const playersVecOffset = 84 // After max_players, current_players, current_turn
      const playersVecSize = 4 + playersCount * 32 // length(4) + players(32 each)
      const playerEliminatedVecOffset = playersVecOffset + playersVecSize
      const playerEliminatedVecSize = 4 + playersCount // length(4) + bools(1 each)
      const gameStatusOffset = playerEliminatedVecOffset + playerEliminatedVecSize + 2 // + total_players + active_players

      if (data.length <= gameStatusOffset) {
        return 'WaitingForPlayers' // Default fallback
      }

      const statusByte = data.readUInt8(gameStatusOffset)

      // GameStatus enum values: WaitingForPlayers = 0, InProgress = 1, Finished = 2
      if (statusByte === 0) {
        return 'WaitingForPlayers'
      } else if (statusByte === 1) {
        return 'InProgress'
      } else if (statusByte === 2) {
        return 'Finished'
      } else {
        console.warn(`Unknown game status discriminator: ${statusByte}, using WaitingForPlayers`)
        return 'WaitingForPlayers'
      }
    } catch (error) {
      console.error('Error parsing game status:', error)
      return 'WaitingForPlayers'
    }
  }

  /**
   * Calculate offset for houses remaining field
   */
  private getHousesOffset(playersCount: number): number {
    // Rough estimate based on GameState struct layout
    const baseOffset = 84 // discriminator + gameId + configId + creator + bump + max + current + current_turn
    const playersVecSize = 4 + playersCount * 32
    const playerEliminatedVecSize = 4 + playersCount
    const gameStatusSize = 1
    const bankBalanceSize = 8
    const freeParkingSize = 8

    return (
      baseOffset + playersVecSize + playerEliminatedVecSize + 2 + gameStatusSize + bankBalanceSize + freeParkingSize
    )
  }

  /**
   * Calculate offset for hotels remaining field
   */
  private getHotelsOffset(playersCount: number): number {
    return this.getHousesOffset(playersCount) + 1 // houses_remaining is 1 byte
  }

  /**
   * Parse bank balance from GameState account data with improved validation
   */
  private parseBankBalanceFromAccountData(data: Buffer, playersCount: number): number {
    try {
      const baseOffset = 84 // After core fields
      const playersVecSize = 4 + playersCount * 32
      const bankBalanceOffset = baseOffset + playersVecSize + 2 // Add space for player related data

      if (bankBalanceOffset + 8 > data.length) {
        console.warn(`Bank balance offset ${bankBalanceOffset} exceeds data length ${data.length}`)
        return 1000000 // Default starting balance
      }

      // Read and validate bank balance
      const rawBalance = data.readBigInt64LE(bankBalanceOffset)

      // Bank balance validation against PostgreSQL bigint range
      if (rawBalance < 0n || rawBalance > 9223372036854775807n) {
        console.warn(`Bank balance ${rawBalance} out of range, using default`)
        return 1000000
      }

      const balance = Number(rawBalance)

      // Additional sanity checks
      if (balance < 0 || balance > 100000000) {
        // Max reasonable game balance
        console.warn(`Bank balance ${balance} outside reasonable range, using default`)
        return 1000000
      }

      return balance
    } catch (error) {
      console.error('Error parsing bank balance:', error)
      return 1000000 // Safe fallback
    }
  }

  /**
   * Parse free parking pool from GameState account data with validation
   */
  private parseFreeParkingPoolFromAccountData(data: Buffer, playersCount: number): number {
    try {
      const MAX_SAFE_BIGINT = 9223372036854775807n // PostgreSQL bigint max

      // Calculate dynamic offset based on actual players count
      const playersVecSize = 4 + playersCount * 32
      const playerEliminatedVecSize = 4 + playersCount

      const freeParkingOffset =
        8 + // discriminator
        8 + // game_id
        32 + // config_id
        32 + // creator
        1 + // bump
        1 + // max_players
        playersVecSize + // players vec (DYNAMIC)
        playerEliminatedVecSize + // player_eliminated vec (DYNAMIC)
        1 + // total_players
        1 + // active_players
        1 + // game_status
        8 // bank_balance

      // Validate buffer bounds
      if (freeParkingOffset + 8 > data.length) {
        console.warn(`⚠️ Buffer overflow: need ${freeParkingOffset + 8} bytes, have ${data.length}`)
        return 0
      }

      const value = data.readBigUInt64LE(freeParkingOffset)

      // Validate within safe bigint range
      if (value > MAX_SAFE_BIGINT) {
        console.warn('⚠️ Free parking pool value exceeds maximum safe bigint')
        return 0
      }

      const freeParkingPool = Number(value)

      // Additional sanity check
      if (freeParkingPool < 0 || freeParkingPool > 100000000) {
        // Max reasonable free parking amount
        console.warn(`⚠️ Free parking pool value ${freeParkingPool} outside reasonable range`)
        return 0
      }

      console.log(`✅ Parsed free parking pool: ${freeParkingPool} from offset ${freeParkingOffset}`)
      return freeParkingPool
    } catch (error) {
      console.error('❌ Error parsing free parking pool:', error)
      return 0
    }
  }

  /**
   * Parse winner from GameState account data
   */
  private parseWinnerFromAccountData(data: Buffer): string | null {
    try {
      // Winner is Option<Pubkey> which is 33 bytes (1 byte flag + 32 bytes pubkey)
      // It comes near the end of the struct
      const startOffset = data.length - 100 // Search in last 100 bytes

      for (let offset = startOffset; offset < data.length - 33; offset++) {
        const hasWinner = this.parseByteAtOffset(data, offset)
        if (hasWinner === 1) {
          // Option::Some
          const winnerBytes = data.subarray(offset + 1, offset + 33)
          try {
            const winner = new PublicKey(winnerBytes).toBase58()
            return winner
          } catch {
            // Invalid pubkey, continue searching
          }
        }
      }

      return null // No winner yet
    } catch (error) {
      console.error('❌ Error parsing winner:', error)
      return null
    }
  }

  /**
   * Derive game account address from config and gameId
   * Based on Rust seeds: [b"game", config.id.as_ref(), &config.next_game_id.to_le_bytes()]
   */
  static deriveGameAccountAddress(programId: string, configId: string, gameId: number): PublicKey {
    try {
      const seeds = [
        Buffer.from('game', 'utf8'),
        new PublicKey(configId).toBuffer(),
        Buffer.from(new BigUint64Array([BigInt(gameId)]).buffer)
      ]

      const [gameAccountPda] = PublicKey.findProgramAddressSync(seeds, new PublicKey(programId))

      return gameAccountPda
    } catch (error) {
      console.error('❌ Error deriving game account address:', error)
      throw error
    }
  }
}
