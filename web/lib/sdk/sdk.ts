import {
  getInitializeGameInstruction,
  getStartGameInstruction,
  getEndTurnInstruction,
  getCancelGameInstruction,
  // getMortgagePropertyInstructionAsync,
  // getUnmortgagePropertyInstructionAsync,
  // getPayRentInstructionAsync,
  // getBuildHouseInstructionAsync,
  // getBuildHotelInstructionAsync,
  // getSellBuildingInstructionAsync,
  getPayMevTaxHandlerInstructionAsync,
  getPayPriorityFeeTaxHandlerInstructionAsync,
  fetchGameState,
  GameState,
  PlayerState,
  fetchPlayerState,
  // fetchAllPropertyState,
  // PropertyState,
  decodeGameState,
  decodePlayerState,
  // getDeclinePropertyInstruction,
  getCommunityChestCardDrawnCodec,
  getChanceCardDrawnCodec,
  getCreatePlatformConfigInstructionAsync,
  fetchPlatformConfig,
  GAME_STATE_DISCRIMINATOR,
  PANDA_MONOPOLY_PROGRAM_ADDRESS,
  getGameStateDecoder,
  getResetGameHandlerInstruction,
  getCloseGameHandlerInstruction,
  getUndelegateGameHandlerInstruction,
  // getBuyPropertyInstruction,
  // getInitPropertyHandlerInstruction,
  getCreateTradeInstruction,
  getAcceptTradeInstruction,
  getRejectTradeInstruction,
  getCancelTradeInstruction,
  getDeclareBankruptcyInstruction,
  getDrawChanceCardInstruction,
  getDrawCommunityChestCardInstruction,
  getUseGetOutOfJailCardInstruction,
  getPayJailFineInstruction,
  getJoinGameInstruction,
  getRollDiceInstruction,
  getBuyPropertyV2Instruction,
  getDeclinePropertyV2Instruction,
  getMortgagePropertyV2Instruction,
  getUnmortgagePropertyV2Instruction,
  getPayRentV2Instruction,
  getBuildHotelV2Instruction,
  getSellBuildingV2Instruction,
  getPlayerPassedGoCodec,
  getGameEndedCodec,
  getTradeCreatedCodec,
  getTradeAcceptedCodec,
  getTradeRejectedCodec,
  getTradeCancelledCodec,
  getTradesCleanedUpCodec,
  getPropertyPurchasedCodec,
  getRentPaidCodec,
  getHouseBuiltCodec,
  getHotelBuiltCodec,
  getBuildingSoldCodec,
  getPropertyMortgagedCodec,
  getPropertyUnmortgagedCodec,
  getPlayerJoinedCodec,
  getGameStartedCodec,
  getSpecialSpaceActionCodec,
  getPlayerBankruptCodec,
  getTaxPaidCodec,
  getGameEndConditionMetCodec,
  getEndGameInstruction,
  getClaimRewardInstruction,
  getBuildHouseV2Instruction,
  getLeaveGameInstruction,
  fetchAllPlayerState,
  fetchAllMaybePlayerState,
  getPlayerLeftCodec,
  getGameCancelledCodec,
  getPropertyDeclinedCodec,
  getPrizeClaimedCodec,
} from "./generated";
import {
  CreateGameIxs,
  CreateGameParams,
  JoinGameParams,
  JoinGameIxs,
  StartGameParams,
  RollDiceParams,
  EndTurnParams,
  PayJailFineParams,
  BuyPropertyParams,
  MortgagePropertyParams,
  UnmortgagePropertyParams,
  PayRentParams,
  BuildHouseParams,
  BuildHotelParams,
  SellBuildingParams,
  DrawChanceCardParams,
  DrawCommunityChestCardParams,
  PayMevTaxParams,
  PayPriorityFeeTaxParams,
  DeclinePropertyParams,
  GameEvent,
  CreatePlatformParams,
  CreateTradeParams,
  AcceptTradeParams,
  RejectTradeParams,
  CancelTradeParams,
  DeclareBankruptcyParams,
  UseGetOutOfJailCardParams,
  EndGameParams,
  ClaimRewardParams,
  LeaveGameParams,
  CancelGameParams,
} from "./types";
import {
  getGameAuthorityPDA,
  getGamePDA,
  getPlatformPDA,
  getPlayerStatePDA,
  getProgramIdentityPDA,
  getPropertyStatePDA,
  getTokenVaultPda,
  getTradeStatePDA,
} from "./pda";
import {
  Account,
  Address,
  getBase58Decoder,
  Rpc,
  SolanaRpcApi,
  type Instruction,
  type GetProgramAccountsMemcmpFilter,
  type ReadonlyUint8Array,
  MaybeEncodedAccount,
  fetchEncodedAccount,
  getBase64Encoder,
  some,
  none,
  GetProgramAccountsApi,
  VariableSizeDecoder,
  getAddressEncoder,
  RpcSubscriptions,
  SolanaRpcSubscriptionsApi,
  getProgramDerivedAddress,
  WritableAccount,
  AccountRole,
  address,
} from "@solana/kit";
import {
  getCreateAssociatedTokenInstructionAsync,
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  fetchToken,
  getSyncNativeInstruction,
} from "@solana-program/token";
import {
  DEFAULT_EPHEMERAL_QUEUE,
  DELEGATION_PROGRAM_ID,
  PLATFORM_ID,
  CHANCE_CARD_DRAWN_EVENT_DISCRIMINATOR,
  COMMUNITY_CHEST_CARD_DRAWN_EVENT_DISCRIMINATOR,
  PLAYER_PASSED_GO_EVENT_DISCRIMINATOR,
  GAME_ENDED_EVENT_DISCRIMINATOR,
  TRADE_CREATED_EVENT_DISCRIMINATOR,
  TRADE_ACCEPTED_EVENT_DISCRIMINATOR,
  TRADE_REJECTED_EVENT_DISCRIMINATOR,
  TRADE_CANCELLED_EVENT_DISCRIMINATOR,
  TRADES_CLEANED_UP_EVENT_DISCRIMINATOR,
  PROPERTY_PURCHASED_EVENT_DISCRIMINATOR,
  RENT_PAID_EVENT_DISCRIMINATOR,
  HOUSE_BUILT_EVENT_DISCRIMINATOR,
  HOTEL_BUILT_EVENT_DISCRIMINATOR,
  BUILDING_SOLD_EVENT_DISCRIMINATOR,
  PROPERTY_MORTGAGED_EVENT_DISCRIMINATOR,
  PROPERTY_UNMORTGAGED_EVENT_DISCRIMINATOR,
  PLAYER_JOINED_EVENT_DISCRIMINATOR,
  GAME_STARTED_EVENT_DISCRIMINATOR,
  SPECIAL_SPACE_ACTION_EVENT_DISCRIMINATOR,
  PLAYER_BANKRUPT_EVENT_DISCRIMINATOR,
  TAX_PAID_EVENT_DISCRIMINATOR,
  GAME_END_CONDITION_MET_EVENT_DISCRIMINATOR,
  PLAYER_LEFT_EVENT_DISCRIMINATOR,
  GAME_CANCELLED_EVENT_DISCRIMINATOR,
  PROPERTY_DECLINED_EVENT_DISCRIMINATOR,
  PRIZE_CLAIMED_EVENT_DISCRIMINATOR,
} from "@/configs/constants";
import { GameAccount, mapGameStateToAccount } from "@/types/schema";
import { getTransferSolInstruction } from "@solana-program/system";

const NATIVE_MINT = address("So11111111111111111111111111111111111111112");

const PROGRAM_LOG = "Program log: ";
const PROGRAM_DATA = "Program data: ";
const PROGRAM_LOG_START_INDEX = PROGRAM_LOG.length;
const PROGRAM_DATA_START_INDEX = PROGRAM_DATA.length;

class MonopolyGameSDK {
  async createPlatformIx(params: CreatePlatformParams): Promise<any> {
    const [configPda] = await getPlatformPDA(params.platformId);

    const instruction = await getCreatePlatformConfigInstructionAsync({
      admin: params.creator,
      config: configPda,
      platformId: params.platformId,
      feeBasisPoints: 100,
      feeVault: params.creator.address,
    });

    return {
      instruction,
      configAddress: configPda,
    };
  }
  /**
   * Create a new monopoly game
   */
  async createGameIx(params: CreateGameParams): Promise<CreateGameIxs> {
    const [configPda] = await getPlatformPDA(params.platformId);

    const configAccount = await fetchPlatformConfig(params.rpc, configPda);

    const [gameAccountPDA] = await getGamePDA(
      configAccount.data.id,
      Number(configAccount.data.nextGameId)
    );

    const [playerStateAddress] = await getPlayerStatePDA(
      gameAccountPDA,
      params.creator.address
    );

    const [gameAuthorityPDA] = await getGameAuthorityPDA();

    let [creatorTokenAccount] = await findAssociatedTokenPda({
      mint: NATIVE_MINT,
      owner: params.creator.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });

    let ixs: Instruction[] = [];

    try {
      await fetchToken(params.rpc, creatorTokenAccount);
    } catch (error) {
      console.log("Creator token account not found, creating a new one");

      const createAtaInstruction =
        await getCreateAssociatedTokenInstructionAsync({
          payer: params.creator,
          mint: NATIVE_MINT,
          owner: params.creator.address,
        });

      ixs.push(createAtaInstruction);
    }

    const amount = Number(params.entryFee) * 10 ** 9;
    if (amount > 0) {
      const transferIx = getTransferSolInstruction({
        source: params.creator,
        destination: creatorTokenAccount,
        amount,
      });

      ixs.push(transferIx);

      const syncIx = getSyncNativeInstruction({
        account: creatorTokenAccount,
      });

      ixs.push(syncIx);
    }

    const [vaultTokenAccount] = await getTokenVaultPda(
      NATIVE_MINT,
      gameAccountPDA
    );

    const instruction = getInitializeGameInstruction({
      game: gameAccountPDA,
      creator: params.creator,
      config: configPda,
      playerState: playerStateAddress,
      gameAuthority: gameAuthorityPDA,
      tokenMint: NATIVE_MINT,
      creatorTokenAccount,
      tokenVault: vaultTokenAccount,
      entryFee: Number(params.entryFee) * 10 ** 9,
      timeLimitSeconds: none(),
    });

    ixs.push(instruction);

    return {
      instructions: ixs,
      gameAccountAddress: gameAccountPDA,
    };
  }

  /**
   * Cancel a monopoly game
   */
  async cancelGameIx(params: CancelGameParams): Promise<Instruction[]> {
    const [gameAuthorityPDA] = await getGameAuthorityPDA();

    const [vaultTokenAccount] = await getTokenVaultPda(
      NATIVE_MINT,
      params.gameAddress
    );

    let ixs: Instruction[] = [];

    const instruction = getCancelGameInstruction({
      game: params.gameAddress,
      creator: params.creator,
      gameAuthority: gameAuthorityPDA,
      tokenMint: NATIVE_MINT,
      tokenVault: vaultTokenAccount,
    });

    const remainingAccounts: WritableAccount[] = [];
    if (params.isFreeGame) {
      for (const playerAddress of params.players) {
        const [playerStateAddress] = await getPlayerStatePDA(
          params.gameAddress,
          address(playerAddress)
        );

        remainingAccounts.push({
          address: playerStateAddress,
          role: AccountRole.WRITABLE,
        });

        remainingAccounts.push({
          address: address(playerAddress),
          role: AccountRole.WRITABLE,
        });
      }
    } else {
      for (const playerAddress of params.players) {
        const [playerStateAddress] = await getPlayerStatePDA(
          params.gameAddress,
          address(playerAddress)
        );

        remainingAccounts.push({
          address: playerStateAddress,
          role: AccountRole.WRITABLE,
        });

        const [playerTokenAccount] = await findAssociatedTokenPda({
          mint: NATIVE_MINT,
          owner: address(playerAddress),
          tokenProgram: TOKEN_PROGRAM_ADDRESS,
        });

        remainingAccounts.push({
          address: playerTokenAccount,
          role: AccountRole.WRITABLE,
        });

        try {
          await fetchToken(params.rpc, playerTokenAccount);
        } catch (error) {
          console.log("Player token account not found, creating a new one");

          const createAtaInstruction =
            await getCreateAssociatedTokenInstructionAsync({
              payer: params.creator,
              mint: NATIVE_MINT,
              owner: address(playerAddress),
            });

          ixs.push(createAtaInstruction);
        }
      }
    }

    instruction.accounts.push(...remainingAccounts);
    ixs.push(instruction);

    return ixs;
  }

  /**
   * Join an existing game
   */
  async joinGameIx(params: JoinGameParams): Promise<JoinGameIxs> {
    const game = await fetchGameState(params.rpc, params.gameAddress);
    if (!game) {
      throw new Error("Game not found");
    }
    const [playerStateAddress] = await getPlayerStatePDA(
      params.gameAddress,
      params.player.address
    );

    const [gameAuthorityPDA] = await getGameAuthorityPDA();

    const [playerTokenAccount] = await findAssociatedTokenPda({
      mint: NATIVE_MINT,
      owner: params.player.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });

    const ixs: Instruction[] = [];

    try {
      await fetchToken(params.rpc, playerTokenAccount);
    } catch (error) {
      console.log("Creator token account not found, creating a new one");

      const createAtaInstruction =
        await getCreateAssociatedTokenInstructionAsync({
          payer: params.player,
          mint: NATIVE_MINT,
          owner: params.player.address,
        });

      ixs.push(createAtaInstruction);
    }

    const amount = Number(game.data.entryFee);

    if (amount > 0) {
      const transferIx = getTransferSolInstruction({
        source: params.player,
        destination: playerTokenAccount,
        amount,
      });

      ixs.push(transferIx);

      const syncIx = getSyncNativeInstruction({
        account: playerTokenAccount,
      });

      ixs.push(syncIx);
    }

    const [vaultTokenAccount] = await getTokenVaultPda(
      NATIVE_MINT,
      params.gameAddress
    );

    const instruction = await getJoinGameInstruction({
      game: params.gameAddress,
      player: params.player,
      playerState: playerStateAddress,
      gameAuthority: gameAuthorityPDA,
      tokenMint: NATIVE_MINT,
      playerTokenAccount,
      tokenVault: vaultTokenAccount,
    });

    ixs.push(instruction);

    return {
      instructions: ixs,
      playerStateAddress: playerStateAddress,
    };
  }

  /**
   * Leave a monopoly game
   */
  async leaveGameIx(params: LeaveGameParams): Promise<Instruction[]> {
    const [playerStateAddress] = await getPlayerStatePDA(
      params.gameAddress,
      params.player.address
    );

    const [gameAuthorityPDA] = await getGameAuthorityPDA();

    const [playerTokenAccount] = await findAssociatedTokenPda({
      mint: NATIVE_MINT,
      owner: params.player.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });

    const ixs: Instruction[] = [];

    try {
      await fetchToken(params.rpc, playerTokenAccount);
    } catch (error) {
      console.log("Creator token account not found, creating a new one");

      const createAtaInstruction =
        await getCreateAssociatedTokenInstructionAsync({
          payer: params.player,
          mint: NATIVE_MINT,
          owner: params.player.address,
        });

      ixs.push(createAtaInstruction);
    }

    const [vaultTokenAccount] = await getTokenVaultPda(
      NATIVE_MINT,
      params.gameAddress
    );

    const instruction = await getLeaveGameInstruction({
      game: params.gameAddress,
      player: params.player,
      playerState: playerStateAddress,
      gameAuthority: gameAuthorityPDA,
      tokenMint: NATIVE_MINT,
      playerTokenAccount,
      tokenVault: vaultTokenAccount,
    });

    ixs.push(instruction);

    return ixs;
  }

  /**
   * Start a game (only game creator can call this)
   */
  async startGameIx(params: StartGameParams): Promise<Instruction> {
    const [bufferGamePda] = await getProgramDerivedAddress({
      programAddress: PANDA_MONOPOLY_PROGRAM_ADDRESS,
      seeds: ["buffer", getAddressEncoder().encode(params.gameAddress)],
    });

    const [delegationRecordGamePda] = await getProgramDerivedAddress({
      programAddress: DELEGATION_PROGRAM_ID,
      seeds: ["delegation", getAddressEncoder().encode(params.gameAddress)],
    });

    const [delegationMetadataGamePda] = await getProgramDerivedAddress({
      programAddress: DELEGATION_PROGRAM_ID,
      seeds: [
        "delegation-metadata",
        getAddressEncoder().encode(params.gameAddress),
      ],
    });

    const ix = getStartGameInstruction({
      bufferGame: bufferGamePda,
      delegationRecordGame: delegationRecordGamePda,
      delegationMetadataGame: delegationMetadataGamePda,
      game: params.gameAddress,
      authority: params.authority,
    });

    const remainingAccounts: WritableAccount[] = [];

    for (const player of params.players) {
      const [playerPda] = await getPlayerStatePDA(params.gameAddress, player);
      remainingAccounts.push({
        address: playerPda,
        role: AccountRole.WRITABLE,
      });

      const [bufferGamePda] = await getProgramDerivedAddress({
        programAddress: PANDA_MONOPOLY_PROGRAM_ADDRESS,
        seeds: ["buffer", getAddressEncoder().encode(playerPda)],
      });

      remainingAccounts.push({
        address: bufferGamePda,
        role: AccountRole.WRITABLE,
      });

      const [delegationRecordGamePda] = await getProgramDerivedAddress({
        programAddress: DELEGATION_PROGRAM_ID,
        seeds: ["delegation", getAddressEncoder().encode(playerPda)],
      });

      remainingAccounts.push({
        address: delegationRecordGamePda,
        role: AccountRole.WRITABLE,
      });

      const [delegationMetadataGamePda] = await getProgramDerivedAddress({
        programAddress: DELEGATION_PROGRAM_ID,
        seeds: ["delegation-metadata", getAddressEncoder().encode(playerPda)],
      });

      remainingAccounts.push({
        address: delegationMetadataGamePda,
        role: AccountRole.WRITABLE,
      });
    }

    ix.accounts.push(...remainingAccounts);

    return ix;
  }

  async resetGameIx(params: StartGameParams): Promise<Instruction> {
    const ix = getResetGameHandlerInstruction({
      game: params.gameAddress,
      authority: params.authority,
    });

    const remainingAccounts: WritableAccount[] = [];

    for (const player of params.players) {
      const [playerPda] = await getPlayerStatePDA(params.gameAddress, player);
      remainingAccounts.push({
        address: playerPda,
        role: AccountRole.WRITABLE,
      });
    }
    ix.accounts.push(...remainingAccounts);

    return ix;
  }

  async closeGameIx(params: StartGameParams): Promise<Instruction[]> {
    const ix1 = getUndelegateGameHandlerInstruction({
      game: params.gameAddress,
      authority: params.authority,
    });

    const remainingAccounts1: WritableAccount[] = [];

    for (const player of params.players) {
      const [playerPda] = await getPlayerStatePDA(params.gameAddress, player);
      remainingAccounts1.push({
        address: playerPda,
        role: AccountRole.WRITABLE,
      });
    }

    ix1.accounts.push(...remainingAccounts1);

    const ix2 = getCloseGameHandlerInstruction({
      game: params.gameAddress,
      authority: params.authority,
    });

    const remainingAccounts2: WritableAccount[] = [];

    for (const player of params.players) {
      const [playerPda] = await getPlayerStatePDA(params.gameAddress, player);
      remainingAccounts2.push({
        address: playerPda,
        role: AccountRole.WRITABLE,
      });
    }

    ix2.accounts.push(...remainingAccounts2);

    return [ix1, ix2];
  }

  async rollDiceIx(params: RollDiceParams): Promise<Instruction> {
    const [playerStatePda] = await getPlayerStatePDA(
      params.gameAddress,
      params.player.address
    );

    const [programIdentityPda] = await getProgramIdentityPDA();

    return await getRollDiceInstruction({
      game: params.gameAddress,
      player: params.player,
      playerState: playerStatePda,
      oracleQueue: DEFAULT_EPHEMERAL_QUEUE,
      programIdentity: programIdentityPda,
      useVrf: params.useVrf,
      clientSeed: Math.floor(Math.random() * 254) + 1,
      diceRoll: params.diceRoll
        ? some(params.diceRoll as unknown as ReadonlyUint8Array)
        : none(),
    });
  }

  /**
   * End current player's turn
   */
  async endTurnIx(params: EndTurnParams): Promise<Instruction> {
    const [playerStatePda] = await getPlayerStatePDA(
      params.gameAddress,
      params.player.address
    );
    return getEndTurnInstruction({
      game: params.gameAddress,
      player: params.player,
      playerState: playerStatePda,
    });
  }

  /**
   * Pay jail fine to get out of jail
   */
  async payJailFineIx(params: PayJailFineParams): Promise<Instruction> {
    const [playerStatePda] = await getPlayerStatePDA(
      params.gameAddress,
      params.player.address
    );

    return await getPayJailFineInstruction({
      game: params.gameAddress,
      player: params.player,
      playerState: playerStatePda,
    });
  }

  async useGetOutOfJailCardIx(
    params: UseGetOutOfJailCardParams
  ): Promise<Instruction> {
    const [playerStatePda] = await getPlayerStatePDA(
      params.gameAddress,
      params.player.address
    );

    return await getUseGetOutOfJailCardInstruction({
      game: params.gameAddress,
      player: params.player,
      playerState: playerStatePda,
    });
  }

  /**
   * Buy a property at the specified position
   */
  // async initPropertyIx(params: BuyPropertyParams): Promise<Instruction> {
  //   const [propertyStateAddress] = await getPropertyStatePDA(
  //     params.gameAddress,
  //     params.position
  //   );

  //   const [bufferGamePda] = await getProgramDerivedAddress({
  //     programAddress: PANDA_MONOPOLY_PROGRAM_ADDRESS,
  //     seeds: ["buffer", getAddressEncoder().encode(propertyStateAddress)],
  //   });

  //   const [delegationRecordGamePda] = await getProgramDerivedAddress({
  //     programAddress: DELEGATION_PROGRAM_ID,
  //     seeds: ["delegation", getAddressEncoder().encode(propertyStateAddress)],
  //   });

  //   const [delegationMetadataGamePda] = await getProgramDerivedAddress({
  //     programAddress: DELEGATION_PROGRAM_ID,
  //     seeds: [
  //       "delegation-metadata",
  //       getAddressEncoder().encode(propertyStateAddress),
  //     ],
  //   });

  //   return getInitPropertyHandlerInstruction({
  //     propertyState: propertyStateAddress,
  //     propertyBufferAccount: bufferGamePda,
  //     propertyDelegationRecordAccount: delegationRecordGamePda,
  //     propertyDelegationMetadataAccount: delegationMetadataGamePda,
  //     authority: params.player,
  //     ownerProgram: PANDA_MONOPOLY_PROGRAM_ADDRESS,
  //     delegationProgram: DELEGATION_PROGRAM_ID,
  //     gameKey: params.gameAddress,
  //     position: params.position,
  //   });
  // }

  // async buyPropertyIx(params: BuyPropertyParams): Promise<Instruction> {
  //   const [playerStateAddress] = await getPlayerStatePDA(
  //     params.gameAddress,
  //     params.player.address
  //   );

  //   const [propertyStateAddress] = await getPropertyStatePDA(
  //     params.gameAddress,
  //     params.position
  //   );

  //   return getBuyPropertyInstruction({
  //     game: params.gameAddress,
  //     player: params.player,
  //     playerState: playerStateAddress,
  //     propertyState: propertyStateAddress,
  //     position: params.position,
  //   });
  // }

  async buyPropertyIxV2(params: BuyPropertyParams): Promise<Instruction> {
    const [playerStateAddress] = await getPlayerStatePDA(
      params.gameAddress,
      params.player.address
    );

    return getBuyPropertyV2Instruction({
      game: params.gameAddress,
      player: params.player,
      playerState: playerStateAddress,
      position: params.position,
    });
  }

  // async declinePropertyIx(params: DeclinePropertyParams): Promise<Instruction> {
  //   const [playerStateAddress] = await getPlayerStatePDA(
  //     params.gameAddress,
  //     params.player.address
  //   );

  //   return await getDeclinePropertyInstruction({
  //     game: params.gameAddress,
  //     playerState: playerStateAddress,
  //     player: params.player,
  //     position: params.position,
  //   });
  // }

  async declinePropertyIxV2(
    params: DeclinePropertyParams
  ): Promise<Instruction> {
    const [playerStateAddress] = await getPlayerStatePDA(
      params.gameAddress,
      params.player.address
    );

    return await getDeclinePropertyV2Instruction({
      game: params.gameAddress,
      playerState: playerStateAddress,
      player: params.player,
      position: params.position,
    });
  }

  /**
   * Mortgage a property to get cash
   */
  // async mortgagePropertyIx(
  //   params: MortgagePropertyParams
  // ): Promise<Instruction> {
  //   const [propertyStateAddress] = await getPropertyStatePDA(
  //     params.gameAddress,
  //     params.position
  //   );

  //   return await getMortgagePropertyInstructionAsync({
  //     game: params.gameAddress,
  //     player: params.player,
  //     propertyState: propertyStateAddress,
  //     position: params.position,
  //   });
  // }

  async mortgagePropertyIxV2(
    params: MortgagePropertyParams
  ): Promise<Instruction> {
    const [playerStateAddress] = await getPlayerStatePDA(
      params.gameAddress,
      params.player.address
    );

    return getMortgagePropertyV2Instruction({
      game: params.gameAddress,
      player: params.player,
      playerState: playerStateAddress,
      position: params.position,
    });
  }

  /**
   * Unmortgage a property by paying the mortgage plus interest
   */
  // async unmortgagePropertyIx(
  //   params: UnmortgagePropertyParams
  // ): Promise<Instruction> {
  //   const [propertyStateAddress] = await getPropertyStatePDA(
  //     params.gameAddress,
  //     params.position
  //   );

  //   return await getUnmortgagePropertyInstructionAsync({
  //     game: params.gameAddress,
  //     player: params.player,
  //     propertyState: propertyStateAddress,
  //     position: params.position,
  //   });
  // }

  async unmortgagePropertyIxV2(
    params: UnmortgagePropertyParams
  ): Promise<Instruction> {
    const [playerStateAddress] = await getPlayerStatePDA(
      params.gameAddress,
      params.player.address
    );

    return getUnmortgagePropertyV2Instruction({
      game: params.gameAddress,
      player: params.player,
      playerState: playerStateAddress,
      position: params.position,
    });
  }

  /**
   * Pay rent when landing on another player's property
   */
  // async payRentIx(params: PayRentParams): Promise<Instruction> {
  //   const [payerStateAddress] = await getPlayerStatePDA(
  //     params.gameAddress,
  //     params.player.address
  //   );

  //   const [owerStateAddress] = await getPlayerStatePDA(
  //     params.gameAddress,
  //     params.propertyOwner
  //   );

  //   const [propertyStateAddress] = await getPropertyStatePDA(
  //     params.gameAddress,
  //     params.position
  //   );

  //   return await getPayRentInstructionAsync({
  //     game: params.gameAddress,
  //     payerState: payerStateAddress,
  //     payer: params.player,
  //     ownerState: owerStateAddress,
  //     propertyOwner: params.propertyOwner,
  //     propertyState: propertyStateAddress,
  //     position: params.position,
  //   });
  // }

  async payRentIxV2(params: PayRentParams): Promise<Instruction> {
    const [payerStateAddress] = await getPlayerStatePDA(
      params.gameAddress,
      params.player.address
    );

    const [owerStateAddress] = await getPlayerStatePDA(
      params.gameAddress,
      params.propertyOwner
    );

    const [propertyStateAddress] = await getPropertyStatePDA(
      params.gameAddress,
      params.position
    );

    return await getPayRentV2Instruction({
      game: params.gameAddress,
      payerState: payerStateAddress,
      payer: params.player,
      ownerState: owerStateAddress,
      propertyOwner: params.propertyOwner,
      position: params.position,
    });
  }

  // Building-related methods

  /**
   * Build a house on a property
   */
  // async buildHouseIx(params: BuildHouseParams): Promise<Instruction> {
  //   const [propertyStateAddress] = await getPropertyStatePDA(
  //     params.gameAddress,
  //     params.position
  //   );

  //   return await getBuildHouseInstructionAsync({
  //     game: params.gameAddress,
  //     player: params.player,
  //     propertyState: propertyStateAddress,
  //     position: params.position,
  //   });
  // }

  async buildHouseIxV2(params: BuildHouseParams): Promise<Instruction> {
    const [playerStateAddress] = await getPlayerStatePDA(
      params.gameAddress,
      params.player.address
    );

    return getBuildHouseV2Instruction({
      game: params.gameAddress,
      player: params.player,
      playerState: playerStateAddress,
      position: params.position,
    });
  }

  async buildHotelIxV2(params: BuildHouseParams): Promise<Instruction> {
    const [playerStateAddress] = await getPlayerStatePDA(
      params.gameAddress,
      params.player.address
    );

    return getBuildHotelV2Instruction({
      game: params.gameAddress,
      player: params.player,
      playerState: playerStateAddress,
      position: params.position,
    });
  }

  /**
   * Sell buildings on a property
   */
  // async sellBuildingIx(params: SellBuildingParams): Promise<Instruction> {
  //   const [propertyStateAddress] = await getPropertyStatePDA(
  //     params.gameAddress,
  //     params.position
  //   );

  //   return await getSellBuildingInstructionAsync({
  //     game: params.gameAddress,
  //     player: params.player,
  //     propertyState: propertyStateAddress,
  //     position: params.position,
  //     buildingType: params.buildingType,
  //   });
  // }

  async sellBuildingIxV2(params: SellBuildingParams): Promise<Instruction> {
    const [playerStateAddress] = await getPlayerStatePDA(
      params.gameAddress,
      params.player.address
    );

    return getSellBuildingV2Instruction({
      game: params.gameAddress,
      player: params.player,
      playerState: playerStateAddress,
      position: params.position,
      buildingType: params.buildingType,
    });
  }

  /**
   * Draw a Chance card
   */
  async drawChanceCardIx(params: DrawChanceCardParams): Promise<Instruction> {
    const [playerStateAddress] = await getPlayerStatePDA(
      params.gameAddress,
      params.player.address
    );

    const [programIdentityPda] = await getProgramIdentityPDA();

    return getDrawChanceCardInstruction({
      game: params.gameAddress,
      player: params.player,
      playerState: playerStateAddress,
      oracleQueue: DEFAULT_EPHEMERAL_QUEUE,
      programIdentity: programIdentityPda,
      useVrf: params.useVrf,
      clientSeed: Math.floor(Math.random() * 254) + 1,
      cardIndex: params.index ? some(params.index) : none(),
    });
  }

  /**
   * Draw a Community Chest card
   */
  async drawCommunityChestCardIx(
    params: DrawCommunityChestCardParams
  ): Promise<Instruction> {
    const [playerStateAddress] = await getPlayerStatePDA(
      params.gameAddress,
      params.player.address
    );

    const [programIdentityPda] = await getProgramIdentityPDA();

    return await getDrawCommunityChestCardInstruction({
      game: params.gameAddress,
      player: params.player,
      playerState: playerStateAddress,
      cardIndex: params.index ? some(params.index) : none(),
      oracleQueue: DEFAULT_EPHEMERAL_QUEUE,
      programIdentity: programIdentityPda,
      clientSeed: Math.floor(Math.random() * 254) + 1,
      useVrf: params.useVrf,
    });
  }

  /**
   * Pay MEV tax
   */
  async payMevTaxIx(params: PayMevTaxParams): Promise<Instruction> {
    return await getPayMevTaxHandlerInstructionAsync({
      game: params.gameAddress,
      player: params.player,
    });
  }

  /**
   * Pay priority fee tax
   */
  async payPriorityFeeTaxIx(
    params: PayPriorityFeeTaxParams
  ): Promise<Instruction> {
    return await getPayPriorityFeeTaxHandlerInstructionAsync({
      game: params.gameAddress,
      player: params.player,
    });
  }

  async createTradeIx(params: CreateTradeParams): Promise<Instruction> {
    const [proposerStateAddress] = await getPlayerStatePDA(
      params.gameAddress,
      params.proposer.address
    );

    const [receiverStateAddress] = await getPlayerStatePDA(
      params.gameAddress,
      params.receiver
    );

    return getCreateTradeInstruction({
      game: params.gameAddress,
      proposerState: proposerStateAddress,
      receiverState: receiverStateAddress,
      proposer: params.proposer,
      receiver: params.receiver,
      tradeType: params.tradeType,
      proposerMoney: params.proposerMoney,
      receiverMoney: params.receiverMoney,
      proposerProperty: params.proposerProperty
        ? some(params.proposerProperty)
        : none(),
      receiverProperty: params.receiverProperty
        ? some(params.receiverProperty)
        : none(),
    });
  }

  async acceptTradeIx(params: AcceptTradeParams): Promise<Instruction> {
    const [accepterStateAddress] = await getPlayerStatePDA(
      params.gameAddress,
      params.accepter.address
    );

    const [proposerStateAddress] = await getPlayerStatePDA(
      params.gameAddress,
      params.proposer
    );

    return getAcceptTradeInstruction({
      game: params.gameAddress,
      proposerState: proposerStateAddress,
      accepterState: accepterStateAddress,
      accepter: params.accepter,
      tradeId: params.tradeId,
    });
  }

  async rejectTradeIx(params: RejectTradeParams): Promise<Instruction> {
    const [rejecterStateAddress] = await getPlayerStatePDA(
      params.gameAddress,
      params.rejecter.address
    );

    return getRejectTradeInstruction({
      game: params.gameAddress,
      rejecter: params.rejecter,
      rejecterState: rejecterStateAddress,
      tradeId: params.tradeId,
    });
  }

  async cancelTradeIx(params: CancelTradeParams): Promise<Instruction> {
    const [cancellerStateAddress] = await getPlayerStatePDA(
      params.gameAddress,
      params.canceller.address
    );

    return getCancelTradeInstruction({
      game: params.gameAddress,
      canceller: params.canceller,
      cancellerState: cancellerStateAddress,
      tradeId: params.tradeId,
    });
  }

  async declareBankruptcyIx(
    params: DeclareBankruptcyParams
  ): Promise<Instruction> {
    const [playerStateAddress] = await getPlayerStatePDA(
      params.gameAddress,
      params.player.address
    );

    return getDeclareBankruptcyInstruction({
      game: params.gameAddress,
      player: params.player,
      playerState: playerStateAddress,
    });
  }

  async endGameIx(params: EndGameParams): Promise<Instruction> {
    const ix = await getEndGameInstruction({
      game: params.gameAddress,
      caller: params.caller,
    });

    const remainingAccounts: WritableAccount[] = [];

    for (const player of params.players) {
      const [playerPda] = await getPlayerStatePDA(params.gameAddress, player);
      remainingAccounts.push({
        address: playerPda,
        role: AccountRole.WRITABLE,
      });
    }

    ix.accounts.push(...remainingAccounts);

    return ix;
  }

  async claimRewardIx(params: ClaimRewardParams): Promise<Instruction> {
    const [gameAuthorityPDA] = await getGameAuthorityPDA();

    const [winnerTokenAccount] = await findAssociatedTokenPda({
      mint: NATIVE_MINT,
      owner: params.winner.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });

    const [vaultTokenAccount] = await getTokenVaultPda(
      NATIVE_MINT,
      params.gameAddress
    );
    console.log("vaultTokenAccount", vaultTokenAccount);

    return getClaimRewardInstruction({
      game: params.gameAddress,
      gameAuthority: gameAuthorityPDA,
      tokenMint: NATIVE_MINT,
      tokenVault: vaultTokenAccount,
      winnerTokenAccount,
      winner: params.winner,
    });
  }

  // Account fetching methods

  async getGameAccount(
    rpc: Rpc<SolanaRpcApi>,
    gameAccount: Address
  ): Promise<Account<GameState, string> | null> {
    try {
      return await fetchGameState(rpc, gameAccount);
    } catch (error) {
      return null;
    }
  }

  async getGameAccounts(rpc: Rpc<SolanaRpcApi>): Promise<GameAccount[]> {
    const discriminator = getBase58Decoder().decode(GAME_STATE_DISCRIMINATOR);
    const discriminatorFilter: GetProgramAccountsMemcmpFilter = {
      memcmp: {
        offset: BigInt(0),
        // @ts-expect-error
        bytes: discriminator,
        encoding: "base58",
      },
    };

    const configFilter: GetProgramAccountsMemcmpFilter = {
      memcmp: {
        offset: BigInt(16),
        // @ts-expect-error
        bytes: getBase58Decoder().decode(
          getAddressEncoder().encode(PLATFORM_ID)
        ),
        encoding: "base58",
      },
    };

    const gameAccount = await fetchDecodedProgramAccounts(
      rpc,
      PANDA_MONOPOLY_PROGRAM_ADDRESS,
      [discriminatorFilter, configFilter],
      getGameStateDecoder()
    );

    return gameAccount.map((acc) =>
      mapGameStateToAccount(acc.data, acc.address)
    );
  }

  async getPlayerAccount(
    rpc: Rpc<SolanaRpcApi>,
    gamePDA: Address,
    player: Address
  ): Promise<Account<PlayerState, string> | null> {
    try {
      const [playerStateAddress] = await getPlayerStatePDA(gamePDA, player);
      return await fetchPlayerState(rpc, playerStateAddress);
    } catch (error) {
      return null;
    }
  }

  async getPlayerAccounts(
    gamePDA: Address,
    playerAddresses: Address[],
    primaryRpc: Rpc<SolanaRpcApi>,
    fallbackRpc: Rpc<SolanaRpcApi>
  ): Promise<Account<PlayerState>[]> {
    try {
      const pdas = (
        await Promise.all(
          playerAddresses.map((player) => getPlayerStatePDA(gamePDA, player))
        )
      ).flatMap((item) => item[0]);

      const maybePlayerStates = await fetchAllMaybePlayerState(
        primaryRpc,
        pdas
      );

      console.log("maybePlayerStates", maybePlayerStates);

      const nonExistentPlayerAddresss = maybePlayerStates
        .filter((item) => !item.exists)
        .map((item) => item.address);

      if (nonExistentPlayerAddresss.length > 0) {
        const fallbackAccounts = await fetchAllMaybePlayerState(
          fallbackRpc,
          nonExistentPlayerAddresss
        );

        return [...maybePlayerStates, ...fallbackAccounts].filter(
          (acc) => acc.exists
        );
      }

      return maybePlayerStates.filter((acc) => acc.exists);
    } catch (error) {
      console.error("Error fetching players states:", error);
      return [];
    }
  }

  /**
   * Get a specific trade by proposer
   */
  async getTradeAccount(
    rpc: Rpc<SolanaRpcApi>,
    gamePDA: Address,
    proposer: Address
  ): Promise<Account<any, string> | null> {
    try {
      const [tradeStateAddress] = await getTradeStatePDA(gamePDA, proposer);
      // @ts-expect-error
      return await fetchTradeState(rpc, tradeStateAddress);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get all active trades for a game
   */
  async getActiveTradesForGame(
    rpc: Rpc<SolanaRpcApi>,
    gamePDA: Address
    // @ts-expect-error
  ): Promise<Account<TradeState, string>[]> {
    try {
      // Import trade discriminator and decoder if available
      // This is a placeholder - would need to implement similar to getGameAccounts
      // For now, we'll return empty array and implement later
      return [];
    } catch (error) {
      console.error("Error fetching trades:", error);
      return [];
    }
  }

  // async getPropertyStateAccounts(
  //   rpc: Rpc<SolanaRpcApi>,
  //   gamePDA: Address,
  //   positions: number[]
  // ): Promise<Account<PropertyState, string>[] | null> {
  //   try {
  //     const addresses = (
  //       await Promise.all(
  //         positions.map((position) => getPropertyStatePDA(gamePDA, position))
  //       )
  //     ).flatMap((item) => item[0]);

  //     return await fetchAllPropertyState(rpc, addresses);
  //   } catch (error) {
  //     return null;
  //   }
  // }

  private async subscribeToAccountInfo(
    rpc: Rpc<SolanaRpcApi>,
    rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>,
    accAddress: Address,
    onAccountChange: (accountInfo: MaybeEncodedAccount<string> | null) => void
  ) {
    let ignoreFetch = false;

    // fetchEncodedAccount(rpc, accAddress)
    //   .then((response) => {
    //     if (ignoreFetch) {
    //       return;
    //     }
    //     onAccountChange(response);
    //   })
    //   .catch((error) => {
    //     console.error("Error fetching account:", accAddress, error);
    //     onAccountChange(null);
    //   });

    const abortController = new AbortController();

    const notifications = await rpcSubscriptions
      .accountNotifications(accAddress, {
        commitment: "confirmed",
        encoding: "base64",
      })
      .subscribe({ abortSignal: abortController.signal });

    (async () => {
      for await (const notification of notifications) {
        ignoreFetch = true;

        const encodedData = getBase64Encoder().encode(
          notification.value.data[0]
        );

        const data: MaybeEncodedAccount<string> = {
          address: accAddress,
          exists: true,
          executable: notification.value.executable,
          lamports: notification.value.lamports,
          programAddress: notification.value.owner,
          space: notification.value.space,
          data: encodedData as any,
        };

        onAccountChange(data);
      }
    })();

    return () => {
      ignoreFetch = true;
      abortController.abort();
    };
  }

  public async subscribeToGameAccount(
    rpc: Rpc<SolanaRpcApi>,
    rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>,
    gameAddress: Address,
    callback: (gameState: GameState | null) => void
  ) {
    let unsubscribed = false;
    let cleanup: (() => void) | null = null;

    if (unsubscribed) return;

    cleanup = await this.subscribeToAccountInfo(
      rpc,
      rpcSubscriptions,
      gameAddress,
      (encodedAccount) => {
        if (encodedAccount === null) {
          callback(null);
          return;
        }

        try {
          const gameAccount = decodeGameState(encodedAccount);
          if (gameAccount.exists) {
            callback(gameAccount.data);
          } else {
            callback(null);
          }
        } catch (error) {
          console.error("Error decoding game account:", error);
          callback(null);
        }
      }
    );

    return () => {
      unsubscribed = true;
      if (cleanup) {
        cleanup();
      }
    };
  }

  public async subscribePlayerStateAccount(
    rpc: Rpc<SolanaRpcApi>,
    rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>,
    gameAddress: Address,
    player: Address,
    callback: (
      playerState: PlayerState | null,
      playerStateAddress: Address
    ) => void
  ) {
    const [playerStateAddress] = await getPlayerStatePDA(gameAddress, player);

    let unsubscribed = false;
    let cleanup: (() => void) | null = null;

    if (unsubscribed) return;

    cleanup = await this.subscribeToAccountInfo(
      rpc,
      rpcSubscriptions,
      playerStateAddress,
      (encodedAccount) => {
        if (encodedAccount === null) {
          callback(null, playerStateAddress);
          return;
        }

        try {
          const playerAccount = decodePlayerState(encodedAccount);
          if (playerAccount.exists) {
            callback(playerAccount.data, playerStateAddress);
          } else {
            callback(null, playerStateAddress);
          }
        } catch (error) {
          console.error("Error decoding player account:", error);
          callback(null, playerStateAddress);
        }
      }
    );

    return () => {
      unsubscribed = true;
      if (cleanup) {
        cleanup();
      }
    };
  }

  public async subscribeToEvents(
    rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>,
    onEvent: (event: GameEvent) => void
  ) {
    const abortController = new AbortController();

    const notifications = await rpcSubscriptions
      .logsNotifications(
        {
          mentions: [PANDA_MONOPOLY_PROGRAM_ADDRESS],
        },
        { commitment: "confirmed" }
      )
      .subscribe({
        abortSignal: abortController.signal,
      });

    (async () => {
      for await (const notification of notifications) {
        try {
          const logs = notification.value.logs;
          if (!logs || logs.length === 0) {
            continue;
          }

          for (const log of logs) {
            const trimmed = log.trim();
            const signature = notification.value.signature.toString();

            if (trimmed.startsWith(PROGRAM_DATA)) {
              const base64 = trimmed.slice(PROGRAM_DATA_START_INDEX);
              const buf = Buffer.from(base64, "base64");

              if (buf.length <= 8) {
                continue;
              }
              const discriminator = buf.subarray(0, 8);

              if (
                discriminator.equals(
                  Buffer.from(CHANCE_CARD_DRAWN_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getChanceCardDrawnCodec().decode(buf.subarray(8));
                onEvent({ type: "ChanceCardDrawn", signature, data });
              } else if (
                discriminator.equals(
                  Buffer.from(COMMUNITY_CHEST_CARD_DRAWN_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getCommunityChestCardDrawnCodec().decode(
                  buf.subarray(8)
                );
                onEvent({ type: "CommunityChestCardDrawn", signature, data });
              } else if (
                discriminator.equals(
                  Buffer.from(PLAYER_PASSED_GO_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getPlayerPassedGoCodec().decode(buf.subarray(8));
                onEvent({ type: "PlayerPassedGo", signature, data });
              } else if (
                discriminator.equals(
                  Buffer.from(GAME_ENDED_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getGameEndedCodec().decode(buf.subarray(8));
                onEvent({ type: "GameEnded", signature, data });
              } else if (
                discriminator.equals(
                  Buffer.from(TRADE_CREATED_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getTradeCreatedCodec().decode(buf.subarray(8));
                onEvent({ type: "TradeCreated", signature, data });
              } else if (
                discriminator.equals(
                  Buffer.from(TRADE_ACCEPTED_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getTradeAcceptedCodec().decode(buf.subarray(8));
                onEvent({ type: "TradeAccepted", signature, data });
              } else if (
                discriminator.equals(
                  Buffer.from(TRADE_REJECTED_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getTradeRejectedCodec().decode(buf.subarray(8));
                onEvent({ type: "TradeRejected", signature, data });
              } else if (
                discriminator.equals(
                  Buffer.from(TRADE_CANCELLED_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getTradeCancelledCodec().decode(buf.subarray(8));
                onEvent({ type: "TradeCancelled", signature, data });
              } else if (
                discriminator.equals(
                  Buffer.from(TRADES_CLEANED_UP_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getTradesCleanedUpCodec().decode(buf.subarray(8));
                onEvent({ type: "TradesCleanedUp", signature, data });
              } else if (
                discriminator.equals(
                  Buffer.from(PROPERTY_PURCHASED_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getPropertyPurchasedCodec().decode(
                  buf.subarray(8)
                );
                onEvent({ type: "PropertyPurchased", signature, data });
              } else if (
                discriminator.equals(
                  Buffer.from(PROPERTY_DECLINED_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getPropertyDeclinedCodec().decode(buf.subarray(8));
                onEvent({ type: "PropertyDeclined", signature, data });
              } else if (
                discriminator.equals(Buffer.from(RENT_PAID_EVENT_DISCRIMINATOR))
              ) {
                const data = getRentPaidCodec().decode(buf.subarray(8));
                onEvent({ type: "RentPaid", signature, data });
              } else if (
                discriminator.equals(
                  Buffer.from(HOUSE_BUILT_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getHouseBuiltCodec().decode(buf.subarray(8));
                onEvent({ type: "HouseBuilt", signature, data });
              } else if (
                discriminator.equals(
                  Buffer.from(HOTEL_BUILT_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getHotelBuiltCodec().decode(buf.subarray(8));
                onEvent({ type: "HotelBuilt", signature, data });
              } else if (
                discriminator.equals(
                  Buffer.from(BUILDING_SOLD_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getBuildingSoldCodec().decode(buf.subarray(8));
                onEvent({ type: "BuildingSold", signature, data });
              } else if (
                discriminator.equals(
                  Buffer.from(PROPERTY_MORTGAGED_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getPropertyMortgagedCodec().decode(
                  buf.subarray(8)
                );
                onEvent({ type: "PropertyMortgaged", signature, data });
              } else if (
                discriminator.equals(
                  Buffer.from(PROPERTY_UNMORTGAGED_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getPropertyUnmortgagedCodec().decode(
                  buf.subarray(8)
                );
                onEvent({ type: "PropertyUnmortgaged", signature, data });
              } else if (
                discriminator.equals(
                  Buffer.from(PLAYER_JOINED_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getPlayerJoinedCodec().decode(buf.subarray(8));
                onEvent({ type: "PlayerJoined", signature, data });
              } else if (
                discriminator.equals(
                  Buffer.from(GAME_STARTED_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getGameStartedCodec().decode(buf.subarray(8));
                onEvent({ type: "GameStarted", signature, data });
              } else if (
                discriminator.equals(
                  Buffer.from(SPECIAL_SPACE_ACTION_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getSpecialSpaceActionCodec().decode(
                  buf.subarray(8)
                );
                onEvent({ type: "SpecialSpaceAction", signature, data });
              } else if (
                discriminator.equals(
                  Buffer.from(PLAYER_BANKRUPT_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getPlayerBankruptCodec().decode(buf.subarray(8));
                onEvent({ type: "PlayerBankrupt", signature, data });
              } else if (
                discriminator.equals(Buffer.from(TAX_PAID_EVENT_DISCRIMINATOR))
              ) {
                const data = getTaxPaidCodec().decode(buf.subarray(8));
                onEvent({ type: "TaxPaid", signature, data });
              } else if (
                discriminator.equals(
                  Buffer.from(GAME_END_CONDITION_MET_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getGameEndConditionMetCodec().decode(
                  buf.subarray(8)
                );
                onEvent({ type: "GameEndConditionMet", signature, data });
              } else if (
                discriminator.equals(
                  Buffer.from(PLAYER_LEFT_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getPlayerLeftCodec().decode(buf.subarray(8));
                onEvent({ type: "PlayerLeft", signature, data });
              } else if (
                discriminator.equals(
                  Buffer.from(GAME_CANCELLED_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getGameCancelledCodec().decode(buf.subarray(8));
                onEvent({ type: "GameCancelled", signature, data });
              } else if (
                discriminator.equals(
                  Buffer.from(PRIZE_CLAIMED_EVENT_DISCRIMINATOR)
                )
              ) {
                const data = getPrizeClaimedCodec().decode(buf.subarray(8));
                onEvent({ type: "PrizeClaimed", signature, data });
              }
            }
          }
        } catch (error) {
          console.error("Error parsing event:", error);
        }
      }
    })();

    return () => {
      abortController.abort();
    };
  }

  // async fetchAllPropertyAccount(
  //   rpc: Rpc<SolanaRpcApi>,
  //   gamePDA: Address,
  //   player: Address
  // ): Promise<Account<PlayerState, string> | null> {
  //   try {
  //     const discriminator = getBase58Decoder().decode(
  //       PROPERTY_STATE_DISCRIMINATOR
  //     );
  //     const discriminatorFilter: GetProgramAccountsMemcmpFilter = {
  //       memcmp: {
  //         offset: BigInt(0),
  //         // @ts-expect-error
  //         bytes: discriminator,
  //         encoding: "base58",
  //       },
  //     };
  //   } catch (error) {
  //     return null;
  //   }
  // }
}

// function parseEvent<T>(
//   logs: readonly string[],
//   programIdStr: string,
//   discriminator: Uint8Array,
//   decoder: Decoder<T>
// ): T | undefined {
//   const stack: string[] = [];
//   for (const log of logs) {
//     // console.log("EEE log", log);
//     const trimmed = log.trim();

//     // if (trimmed.startsWith(`Program ${programIdStr} invoke`)) {
//     //   stack.push(programIdStr);
//     //   continue;
//     // }

//     // if (
//     //   trimmed.startsWith(`Program ${programIdStr} success`) ||
//     //   trimmed.startsWith(`Program ${programIdStr} failed`)
//     // ) {
//     //   stack.pop();
//     //   continue;
//     // }

//     // if (stack.length === 0 || stack[stack.length - 1] !== programIdStr) {
//     //   continue;
//     // }

//     console.log("EEE log trim", trimmed);

//     if (
//       trimmed.startsWith(PROGRAM_DATA)
//       // || trimmed.startsWith(PROGRAM_LOG)
//     ) {
//       const base64 = trimmed.startsWith(PROGRAM_DATA)
//         ? trimmed.slice(PROGRAM_DATA_START_INDEX)
//         : trimmed.slice(PROGRAM_LOG_START_INDEX);

//       console.log("EEE log base64", base64);

//       const buf = Buffer.from(base64, "base64");
//       console.log(
//         "EEE log buf",
//         buf,
//         buf.subarray(0, 8)
//         // buf.subarray(0, 8).equals(discriminator)
//       );
//       if (buf.length >= 8 && buf.subarray(0, 8).equals(discriminator)) {
//         return decoder.decode(buf.subarray(8));
//       }
//     }
//   }

//   return undefined;
// }

const sdk = new MonopolyGameSDK();
export { sdk };

export async function fetchDecodedProgramAccounts<T extends object>(
  rpc: Rpc<GetProgramAccountsApi>,
  programAddress: Address,
  filters: GetProgramAccountsMemcmpFilter[],
  decoder: VariableSizeDecoder<T>
): Promise<Account<T>[]> {
  const accountInfos = await rpc
    .getProgramAccounts(programAddress, {
      encoding: "base64",
      filters,
    })
    .send();

  const encoder = getBase64Encoder();

  const datas = accountInfos.map((x) => encoder.encode(x.account.data[0]));

  const decoded = datas.map((x) => {
    try {
      return decoder.decode(x);
    } catch (error) {
      return null;
    }
  });

  return decoded
    .filter((x) => !!x)
    .map((data, i) => ({
      ...accountInfos[i]!.account,
      address: accountInfos[i]!.pubkey,
      programAddress: programAddress,
      data,
    }));
}
