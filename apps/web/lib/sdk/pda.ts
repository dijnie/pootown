import {
  getProgramDerivedAddress,
  getAddressEncoder,
  type Address,
  type ProgramDerivedAddress,
  getU64Encoder,
  getU8Encoder,
} from "@solana/kit";
import { PANDA_MONOPOLY_PROGRAM_ADDRESS } from "./generated";

export async function getPlatformPDA(
  platformId: Address
): Promise<ProgramDerivedAddress> {
  return await getProgramDerivedAddress({
    programAddress: PANDA_MONOPOLY_PROGRAM_ADDRESS,
    seeds: ["platform", getAddressEncoder().encode(platformId)],
  });
}

/**
 * Get the PDA for a game account
 * Seeds: ["game", authority]
 */
export async function getGamePDA(
  configId: Address,
  gameId: number
  // authority: Address
): Promise<ProgramDerivedAddress> {
  return await getProgramDerivedAddress({
    programAddress: PANDA_MONOPOLY_PROGRAM_ADDRESS,
    seeds: [
      "game",
      getAddressEncoder().encode(configId),
      getU64Encoder().encode(gameId),
    ],
  });
}

/**
 * Get the PDA for a player state account
 * Seeds: ["player", game, player]
 */
export async function getPlayerStatePDA(
  game: Address,
  player: Address
): Promise<ProgramDerivedAddress> {
  return await getProgramDerivedAddress({
    programAddress: PANDA_MONOPOLY_PROGRAM_ADDRESS,
    seeds: [
      "player",
      getAddressEncoder().encode(game),
      getAddressEncoder().encode(player),
    ],
  });
}

export async function getPropertyStatePDA(
  game: Address,
  position: number
): Promise<ProgramDerivedAddress> {
  return await getProgramDerivedAddress({
    programAddress: PANDA_MONOPOLY_PROGRAM_ADDRESS,
    seeds: [
      "property",
      getAddressEncoder().encode(game),
      getU8Encoder().encode(position),
    ],
  });
}

export async function getTradeStatePDA(
  game: Address,
  proposer: Address
): Promise<ProgramDerivedAddress> {
  return await getProgramDerivedAddress({
    programAddress: PANDA_MONOPOLY_PROGRAM_ADDRESS,
    seeds: [
      "trade",
      getAddressEncoder().encode(game),
      getAddressEncoder().encode(proposer),
    ],
  });
}

export async function getProgramIdentityPDA(): Promise<ProgramDerivedAddress> {
  return await getProgramDerivedAddress({
    programAddress: PANDA_MONOPOLY_PROGRAM_ADDRESS,
    seeds: ["identity"],
  });
}

export async function getGameAuthorityPDA(): Promise<ProgramDerivedAddress> {
  return await getProgramDerivedAddress({
    programAddress: PANDA_MONOPOLY_PROGRAM_ADDRESS,
    seeds: ["game_authority"],
  });
}

export async function getTokenVaultPda(
  mintAddress: Address,
  gameAddress: Address
): Promise<ProgramDerivedAddress> {
  return await getProgramDerivedAddress({
    programAddress: PANDA_MONOPOLY_PROGRAM_ADDRESS,
    seeds: [
      "token_vault",
      getAddressEncoder().encode(mintAddress),
      getAddressEncoder().encode(gameAddress),
    ],
  });
}
