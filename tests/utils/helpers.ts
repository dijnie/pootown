import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import { TestContext } from "./setup";
import { TEST_CONSTANTS, GAME_STATUS } from "./constants";

export async function assertGameState(
  ctx: TestContext,
  expectedStatus: any,
  expectedPlayers?: number
) {
  const gameState = await ctx.program.account.gameState.fetch(ctx.gameAccount);
  
  expect(gameState.gameStatus).to.deep.equal(expectedStatus);
  expect(gameState.authority.toString()).to.equal(ctx.authority.publicKey.toString());
  
  if (expectedPlayers !== undefined) {
    expect(gameState.currentPlayers).to.equal(expectedPlayers);
    expect(gameState.players).to.have.length(expectedPlayers);
  }
}

export async function assertPlayerState(
  ctx: TestContext,
  playerIndex: number,
  expectedCash?: number,
  expectedPosition?: number
) {
  const [playerStateAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("player"), ctx.gameAccount.toBuffer(), ctx.players[playerIndex].publicKey.toBuffer()],
    ctx.program.programId
  );
  
  const playerState = await ctx.program.account.playerState.fetch(playerStateAccount);
  
  expect(playerState.wallet.toString()).to.equal(ctx.players[playerIndex].publicKey.toString());
  expect(playerState.game.toString()).to.equal(ctx.gameAccount.toString());
  
  if (expectedCash !== undefined) {
    expect(playerState.cashBalance.toNumber()).to.equal(expectedCash);
  }
  
  if (expectedPosition !== undefined) {
    expect(playerState.position).to.equal(expectedPosition);
  }
}

export function expectError(error: any, expectedMessage: string) {
  expect(error.error.errorMessage).to.include(expectedMessage);
}