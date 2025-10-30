import { Connection, PublicKey } from '@solana/web3.js'
import { parseGameStateFromBlockchain } from './rust-based-mapping'
import { logger } from '#utils/logger'

export interface EnhancedGameData {
  gameId: number
  configId: string
  authority: string
  bump: number
  maxPlayers: number
  currentPlayers: number
  currentTurn: number
  players: string[]
  gameStatus: 'WaitingForPlayers' | 'InProgress' | 'Finished'
  bankBalance: number
  freeParkingPool: number
  housesRemaining: number
  hotelsRemaining: number
  winner?: string | null
  nextTradeId: number
  activeTrades: any[]
  createdAt?: number
  startedAt?: number | null
  endedAt?: number | null
  gameEndTime?: number | null
  entryFee?: number
  tokenMint?: string | null
  tokenVault?: string | null
  totalPrizePool?: number
  prizeClaimed?: boolean
}

export class EnhancedBlockchainAccountFetcher {
  private connection: Connection

  constructor(rpcEndpoint?: string) {
    this.connection = new Connection(rpcEndpoint || 'https://api.devnet.solana.com', 'confirmed')
  }

  async fetchEnhancedGameData(pubkey: string): Promise<EnhancedGameData | null> {
    try {
      logger.debug(`🔍 Fetching GameState data for: ${pubkey}`)

      const publicKey = new PublicKey(pubkey)
      const accountInfo = await this.connection.getAccountInfo(publicKey)

      if (!accountInfo || !accountInfo.data || accountInfo.data.length === 0) {
        logger.debug(`⚠️ Account ${pubkey} is closed - this is normal for completed games`)
        // Don't try to parse - return null so the system can use existing database data
        return null
      }

      logger.debug(`✅ Found account data: ${accountInfo.data.length} bytes`)

      const rustGameState = parseGameStateFromBlockchain(accountInfo.data, pubkey)

      if (!rustGameState) {
        logger.debug(`⚠️ Failed to parse GameState: ${pubkey}`)
        return null
      }

      const enhancedData: EnhancedGameData = {
        gameId: rustGameState.gameId,
        configId: rustGameState.configId.toString(),
        authority: rustGameState.authority.toString(),
        bump: rustGameState.bump,
        maxPlayers: rustGameState.maxPlayers,
        currentPlayers: rustGameState.currentPlayers,
        currentTurn: rustGameState.currentTurn,
        players: rustGameState.players.map((p) => p.toString()),
        gameStatus: (['WaitingForPlayers', 'InProgress', 'Finished'] as const)[rustGameState.gameStatus],
        bankBalance: Number(rustGameState.bankBalance),
        freeParkingPool: Number(rustGameState.freeParkingPool),
        housesRemaining: rustGameState.housesRemaining,
        hotelsRemaining: rustGameState.hotelsRemaining,
        winner: rustGameState.winner?.toString() || null,
        nextTradeId: rustGameState.nextTradeId,
        activeTrades: rustGameState.activeTrades || [],
        createdAt: rustGameState.createdAt,
        startedAt: rustGameState.startedAt ?? null,
        endedAt: rustGameState.endedAt ?? null,
        gameEndTime: rustGameState.gameEndTime ?? null,
        // Fee-related fields
        entryFee: Number(rustGameState.entryFee || 0n),
        tokenMint: rustGameState.tokenMint?.toString() || null,
        tokenVault: rustGameState.tokenVault?.toString() || null,
        totalPrizePool: Number(rustGameState.totalPrizePool || 0n),
        prizeClaimed: rustGameState.prizeClaimed ?? false
      }

      logger.debug(
        {
          gameId: enhancedData.gameId,
          configId: enhancedData.configId.slice(0, 8) + '...',
          players: enhancedData.players.length,
          bankBalance: enhancedData.bankBalance
        },
        '✅ Parsed GameState'
      )

      logger.info(
        {
          pubkey,
          createdAt: enhancedData.createdAt,
          createdAtType: typeof enhancedData.createdAt,
          startedAt: enhancedData.startedAt,
          endedAt: enhancedData.endedAt,
          gameEndTime: enhancedData.gameEndTime
        },
        '⏱️ Decoded time fields'
      )

      return enhancedData
    } catch (error: any) {
      logger.error({ error: error?.message, pubkey }, '❌ Error fetching GameState')
      return null
    }
  }

  async fetchMultipleGameStates(pubkeys: string[]): Promise<Map<string, EnhancedGameData>> {
    logger.debug(`🔍 Fetching ${pubkeys.length} GameState accounts in batch...`)

    const results = new Map<string, EnhancedGameData>()
    const chunkSize = 10

    for (let i = 0; i < pubkeys.length; i += chunkSize) {
      const chunk = pubkeys.slice(i, i + chunkSize)

      const promises = chunk.map(async (pubkey) => {
        const data = await this.fetchEnhancedGameData(pubkey)
        if (data) {
          results.set(pubkey, data)
        }
      })

      await Promise.all(promises)

      if (i + chunkSize < pubkeys.length) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }

    logger.debug(`✅ Successfully fetched ${results.size}/${pubkeys.length} accounts`)
    return results
  }

  mapToDatabase(blockchainData: EnhancedGameData, pubkey: string) {
    return {
      pubkey,
      gameId: blockchainData.gameId,
      configId: blockchainData.configId,
      authority: blockchainData.authority,
      bump: blockchainData.bump,
      maxPlayers: blockchainData.maxPlayers,
      currentPlayers: blockchainData.currentPlayers,
      currentTurn: blockchainData.currentTurn,
      players: blockchainData.players,
      gameStatus: blockchainData.gameStatus,
      bankBalance: blockchainData.bankBalance,
      freeParkingPool: blockchainData.freeParkingPool,
      housesRemaining: blockchainData.housesRemaining,
      hotelsRemaining: blockchainData.hotelsRemaining,
      winner: blockchainData.winner,
      nextTradeId: blockchainData.nextTradeId,
      activeTrades: blockchainData.activeTrades,
      startedAt: blockchainData.startedAt ?? undefined,
      endedAt: blockchainData.endedAt ?? undefined,
      gameEndTime: blockchainData.gameEndTime ?? undefined,
      // Fee-related mappings
      entryFee: blockchainData.entryFee ?? 0,
      totalPrizePool: blockchainData.totalPrizePool ?? 0,
      tokenMint: blockchainData.tokenMint ?? 'UNKNOWN',
      tokenVault: blockchainData.tokenVault ?? 'UNKNOWN',
      prizeClaimed: blockchainData.prizeClaimed ?? false,
      accountUpdatedAt: new Date()
    }
  }

  async testConnection(programId?: string): Promise<boolean> {
    try {
      logger.debug('🔍 Testing connection and program availability...')

      const version = await this.connection.getVersion()
      logger.debug(`✅ Connected to Solana RPC: ${JSON.stringify(version)}`)

      if (programId) {
        const accounts = await this.connection.getProgramAccounts(new PublicKey(programId), { commitment: 'confirmed' })
        logger.debug(`✅ Program ${programId} has ${accounts.length} accounts`)
      }

      return true
    } catch (error: any) {
      logger.error({ error: error?.message, programId }, '❌ Connection test failed')
      return false
    }
  }
}

export const BlockchainAccountFetcher = EnhancedBlockchainAccountFetcher
export default EnhancedBlockchainAccountFetcher
