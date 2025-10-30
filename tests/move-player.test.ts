import { expect } from "chai";
import { setupTest, TestContext, getPlayerStatePDA } from "./utils/setup";
import { assertGameState } from "./utils/helpers";
import { TEST_CONSTANTS, GAME_STATUS } from "./utils/constants";
import { SystemProgram } from "@solana/web3.js";

describe("Move Player", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTest(2);
    
    // Setup complete game
    await ctx.program.methods
      .initializeGame()
      .accounts({
        game: ctx.gameAccount,
        authority: ctx.authority.publicKey,
        systemProgram: SystemProgram.programId,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .signers([ctx.authority])
      .rpc();

    for (let i = 0; i < 2; i++) {
      const [playerStateAccount] = getPlayerStatePDA(
        ctx.program,
        ctx.gameAccount,
        ctx.players[i].publicKey
      );

      await ctx.program.methods
        .joinGame()
        .accounts({
          game: ctx.gameAccount,
          playerState: playerStateAccount,
          player: ctx.players[i].publicKey,
          systemProgram: SystemProgram.programId,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        })
        .signers([ctx.players[i]])
        .rpc();
    }

    await ctx.program.methods
      .startGame()
      .accounts({
        game: ctx.gameAccount,
        authority: ctx.authority.publicKey,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .signers([ctx.authority])
      .rpc();
  });

  it("should allow current player to move", async () => {
    await ctx.program.methods
      .movePlayer()
      .accounts({
        game: ctx.gameAccount,
        player: ctx.players[0].publicKey,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .signers([ctx.players[0]])
      .rpc();

    // Verify game state
    await assertGameState(ctx, GAME_STATUS.IN_PROGRESS, 2);
    
    const gameState = await ctx.program.account.gameState.fetch(ctx.gameAccount);
    expect(gameState.turnStartedAt.toNumber()).to.be.greaterThan(0);
  });

  it("should update turn timestamp on movement", async () => {
    const gameStateBefore = await ctx.program.account.gameState.fetch(ctx.gameAccount);
    const timestampBefore = gameStateBefore.turnStartedAt.toNumber();

    // Wait a moment to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 1000));

    await ctx.program.methods
      .movePlayer()
      .accounts({
        game: ctx.gameAccount,
        player: ctx.players[0].publicKey,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .signers([ctx.players[0]])
      .rpc();

    const gameStateAfter = await ctx.program.account.gameState.fetch(ctx.gameAccount);
    expect(gameStateAfter.turnStartedAt.toNumber()).to.be.greaterThan(timestampBefore);
  });
});