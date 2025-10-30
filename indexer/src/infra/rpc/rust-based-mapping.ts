/**
 * Blockchain Data Mapping Functions
 * Based on Solana Rust program structure
 */

import { PublicKey } from '@solana/web3.js'
import type { GameState as DatabaseGameState } from '../db/schema'

export const ACCOUNT_DISCRIMINATORS = {
  GAME_STATE: Buffer.from([]),
  PLAYER_STATE: Buffer.from([]),
  PLATFORM_CONFIG: Buffer.from([]),
  PROPERTY_STATE: Buffer.from([])
}

export interface RustGameState {
  discriminator: Buffer
  gameId: number
  configId: PublicKey
  authority: PublicKey
  bump: number
  maxPlayers: number
  currentPlayers: number
  currentTurn: number
  players: PublicKey[]
  gameStatus: GameStatus
  turnStartedAt: number
  timeLimit?: number | null
  bankBalance: bigint
  freeParkingPool: bigint
  housesRemaining: number
  hotelsRemaining: number
  winner: PublicKey | null
  nextTradeId: number
  activeTrades: TradeInfo[]
  createdAt: number
  startedAt?: number | null
  endedAt?: number | null
  gameEndTime?: number | null
  entryFee: bigint
  tokenMint: PublicKey | null
  tokenVault: PublicKey | null
  totalPrizePool: bigint
  prizeClaimed: boolean
}

export enum GameStatus {
  WaitingForPlayers = 0,
  InProgress = 1,
  Finished = 2
}

export interface TradeInfo {
  tradeId: number
  proposer: PublicKey
  acceptor: PublicKey
}

export function parseGameStateFromBlockchain(accountData: Buffer, pubkey: string): RustGameState | null {
  if (accountData.length < 8) {
    console.warn(`Account ${pubkey} data too short: ${accountData.length} bytes`)
    return null
  }

  try {
    let offset = 0

    const discriminator = accountData.subarray(0, 8)
    offset += 8

    // gameId: u64
    if (accountData.length < offset + 8) return null
    const gameId = Number(accountData.readBigUInt64LE(offset))
    offset += 8

    // configId: Pubkey
    if (accountData.length < offset + 32) return null
    const configId = new PublicKey(accountData.subarray(offset, offset + 32))
    offset += 32

    // authority/creator: Pubkey
    if (accountData.length < offset + 32) return null
    const authority = new PublicKey(accountData.subarray(offset, offset + 32))
    offset += 32

    // bump, maxPlayers, currentPlayers, currentTurn: u8
    if (accountData.length < offset + 4) return null
    const bump = accountData.readUInt8(offset)
    const maxPlayers = accountData.readUInt8(offset + 1)
    const currentPlayers = accountData.readUInt8(offset + 2)
    const currentTurn = accountData.readUInt8(offset + 3)
    offset += 4

    // players: Vec<Pubkey> => [len: u32] + N * 32
    if (accountData.length < offset + 4) return null
    const playersLength = accountData.readUInt32LE(offset)
    offset += 4
    const players: PublicKey[] = []
    for (let i = 0; i < playersLength; i++) {
      if (accountData.length < offset + 32) break
      players.push(new PublicKey(accountData.subarray(offset, offset + 32)))
      offset += 32
    }

    // playerEliminated: Vec<bool> => [len: u32] + N * 1 (skip)
    if (accountData.length < offset + 4) return null
    const eliminatedLength = accountData.readUInt32LE(offset)
    offset += 4
    // skip N booleans
    if (accountData.length < offset + eliminatedLength) return null
    offset += eliminatedLength

    // totalPlayers u8 + activePlayers u8
    if (accountData.length < offset + 2) return null
    offset += 2

    // gameStatus: u8
    if (accountData.length < offset + 1) return null
    const gameStatus = accountData.readUInt8(offset) as GameStatus
    offset += 1

    // bankBalance u64 + freeParkingPool u64
    if (accountData.length < offset + 16) return null
    const bankBalance = accountData.readBigUInt64LE(offset)
    const freeParkingPool = accountData.readBigUInt64LE(offset + 8)
    offset += 16

    // housesRemaining u8, hotelsRemaining u8
    if (accountData.length < offset + 2) return null
    const housesRemaining = accountData.readUInt8(offset)
    const hotelsRemaining = accountData.readUInt8(offset + 1)
    offset += 2

    // winner: Option<Pubkey> => flag u8 + optional 32 bytes
    if (accountData.length < offset + 1) return null
    const winnerFlag = accountData.readUInt8(offset)
    offset += 1
    let winner: PublicKey | null = null
    if (winnerFlag === 1) {
      if (accountData.length < offset + 32) return null
      winner = new PublicKey(accountData.subarray(offset, offset + 32))
      offset += 32
    }

    // entryFee u64
    if (accountData.length < offset + 8) return null
    const entryFee = accountData.readBigUInt64LE(offset)
    offset += 8

    // tokenMint: Option<Address>
    if (accountData.length < offset + 1) return null
    const tokenMintFlag = accountData.readUInt8(offset)
    offset += 1
    let tokenMint: PublicKey | null = null
    if (tokenMintFlag === 1) {
      if (accountData.length < offset + 32) return null
      tokenMint = new PublicKey(accountData.subarray(offset, offset + 32))
      offset += 32
    }

    // tokenVault: Option<Address>
    if (accountData.length < offset + 1) return null
    const tokenVaultFlag = accountData.readUInt8(offset)
    offset += 1
    let tokenVault: PublicKey | null = null
    if (tokenVaultFlag === 1) {
      if (accountData.length < offset + 32) return null
      tokenVault = new PublicKey(accountData.subarray(offset, offset + 32))
      offset += 32
    }

    // totalPrizePool u64
    if (accountData.length < offset + 8) return null
    const totalPrizePool = accountData.readBigUInt64LE(offset)
    offset += 8

    // prizeClaimed bool + endConditionMet bool
    if (accountData.length < offset + 2) return null
    const prizeClaimed = accountData.readUInt8(offset) === 1
    const endConditionMet = accountData.readUInt8(offset + 1) === 1
    offset += 2

    // endReason: Option<GameEndReason> => flag u8 + optional enum u8 (skip value)
    if (accountData.length < offset + 1) return null
    const endReasonFlag = accountData.readUInt8(offset)
    offset += 1
    if (endReasonFlag === 1) {
      if (accountData.length < offset + 1) return null
      offset += 1
    }

    // activeTrades: Vec<TradeInfo>
    if (accountData.length < offset + 4) return null
    const tradesLength = accountData.readUInt32LE(offset)
    offset += 4
    const activeTrades: TradeInfo[] = []
    for (let i = 0; i < tradesLength; i++) {
      if (accountData.length < offset + 1 + 32 + 32) break
      const tradeId = accountData.readUInt8(offset)
      const proposer = new PublicKey(accountData.subarray(offset + 1, offset + 33))
      const acceptor = new PublicKey(accountData.subarray(offset + 33, offset + 65))
      activeTrades.push({ tradeId, proposer, acceptor })
      offset += 65
    }

    // properties: Vec<PropertyInfo> (skip parsing details here)
    if (accountData.length < offset + 4) return null
    const propertiesLength = accountData.readUInt32LE(offset)
    offset += 4
    for (let i = 0; i < propertiesLength; i++) {
      if (accountData.length < offset + 1) return null
      const ownerFlag = accountData.readUInt8(offset)
      offset += 1
      if (ownerFlag === 1) {
        if (accountData.length < offset + 32) return null
        offset += 32
      }
      // houses u8, hasHotel bool u8, isMortgaged bool u8
      if (accountData.length < offset + 3) return null
      offset += 3
    }

    // createdAt i64
    if (accountData.length < offset + 8) return null
    const createdAt = Number(accountData.readBigInt64LE(offset))
    offset += 8

    // startedAt Option<i64>
    if (accountData.length < offset + 1) return null
    const startedFlag = accountData.readUInt8(offset)
    offset += 1
    let startedAt: number | null = null
    if (startedFlag === 1) {
      if (accountData.length < offset + 8) return null
      startedAt = Number(accountData.readBigInt64LE(offset))
      offset += 8
    }

    // endedAt Option<i64>
    if (accountData.length < offset + 1) return null
    const endedFlag = accountData.readUInt8(offset)
    offset += 1
    let endedAt: number | null = null
    if (endedFlag === 1) {
      if (accountData.length < offset + 8) return null
      endedAt = Number(accountData.readBigInt64LE(offset))
      offset += 8
    }

    // gameEndTime Option<i64>
    if (accountData.length < offset + 1) return null
    const endTimeFlag = accountData.readUInt8(offset)
    offset += 1
    let gameEndTime: number | null = null
    if (endTimeFlag === 1) {
      if (accountData.length < offset + 8) return null
      gameEndTime = Number(accountData.readBigInt64LE(offset))
      offset += 8
    }

    // turnStartedAt i64
    if (accountData.length < offset + 8) return null
    const turnStartedAt = Number(accountData.readBigInt64LE(offset))
    offset += 8

    // timeLimit Option<i64>
    if (accountData.length < offset + 1) return null
    const timeLimitFlag = accountData.readUInt8(offset)
    offset += 1
    let timeLimit: number | null = null
    if (timeLimitFlag === 1) {
      if (accountData.length < offset + 8) return null
      timeLimit = Number(accountData.readBigInt64LE(offset))
      offset += 8
    }

    return {
      discriminator,
      gameId,
      configId,
      authority,
      bump,
      maxPlayers,
      currentPlayers,
      currentTurn,
      players,
      gameStatus,
      turnStartedAt,
      timeLimit,
      bankBalance,
      freeParkingPool,
      housesRemaining,
      hotelsRemaining,
      winner,
      nextTradeId: 0,
      activeTrades,
      createdAt,
      startedAt,
      endedAt,
      gameEndTime,
      entryFee,
      tokenMint,
      tokenVault,
      totalPrizePool,
      prizeClaimed
    }
  } catch (error) {
    console.error(`Error parsing GameState ${pubkey}:`, error)
    return null
  }
}

export function mapGameStateToDatabase(blockchainData: RustGameState, pubkey: string): Partial<DatabaseGameState> {
  return {
    pubkey,
    gameId: blockchainData.gameId,
    configId: blockchainData.configId.toString(),
    authority: blockchainData.authority.toString(),
    bump: blockchainData.bump,
    maxPlayers: blockchainData.maxPlayers,
    currentPlayers: blockchainData.currentPlayers,
    currentTurn: blockchainData.currentTurn,
    players: blockchainData.players.map((p) => p.toString()),
    createdAt: blockchainData.createdAt,
    gameStatus: Object.keys(GameStatus)[blockchainData.gameStatus] as any,
    turnStartedAt: blockchainData.turnStartedAt,
    timeLimit: blockchainData.timeLimit ?? null,
    bankBalance: Number(blockchainData.bankBalance),
    freeParkingPool: Number(blockchainData.freeParkingPool),
    housesRemaining: blockchainData.housesRemaining,
    hotelsRemaining: blockchainData.hotelsRemaining,
    winner: blockchainData.winner?.toString() || null,
    nextTradeId: blockchainData.nextTradeId,
    activeTrades: [],
    startedAt: blockchainData.startedAt ?? null,
    endedAt: blockchainData.endedAt ?? null,
    gameEndTime: blockchainData.gameEndTime ?? null,
    // Fee-related mappings
    entryFee: Number(blockchainData.entryFee || 0n),
    totalPrizePool: Number(blockchainData.totalPrizePool || 0n),
    tokenMint: blockchainData.tokenMint?.toString() || 'UNKNOWN',
    tokenVault: blockchainData.tokenVault?.toString() || 'UNKNOWN',
    prizeClaimed: blockchainData.prizeClaimed ?? false,
    accountUpdatedAt: new Date()
  }
}

export function sanitizeGameState(gameState: any): Partial<DatabaseGameState> {
  return {
    pubkey: gameState.pubkey,
    gameId: gameState.gameId >= 0 ? gameState.gameId : 0,
    configId: gameState.configId !== 'UNKNOWN' ? gameState.configId : null,
    authority: gameState.authority !== 'UNKNOWN' ? gameState.authority : null,
    bump: gameState.bump >= 0 ? gameState.bump : 255,
    maxPlayers: gameState.maxPlayers || 4,
    currentPlayers: gameState.currentPlayers || 0,
    currentTurn: gameState.currentTurn || 0,
    players: Array.isArray(gameState.players) ? gameState.players : [],
    gameStatus: ['WaitingForPlayers', 'InProgress', 'Finished'].includes(gameState.gameStatus)
      ? gameState.gameStatus
      : 'WaitingForPlayers',
    bankBalance: gameState.bankBalance >= 0 ? gameState.bankBalance : 15140000,
    housesRemaining: gameState.housesRemaining >= 0 ? gameState.housesRemaining : 32,
    hotelsRemaining: gameState.hotelsRemaining >= 0 ? gameState.hotelsRemaining : 12,
    freeParkingPool: gameState.freeParkingPool >= 0 ? gameState.freeParkingPool : 0,
    activeTrades: Array.isArray(gameState.activeTrades) ? gameState.activeTrades : [],
    accountUpdatedAt: new Date()
  }
}

export const DEFAULT_GAME_VALUES = {
  BANK_BALANCE: 15140000,
  HOUSES_COUNT: 32,
  HOTELS_COUNT: 12,
  MAX_PLAYERS: 4,
  TIME_LIMIT: 300,
  FREE_PARKING_INITIAL: 0
}
