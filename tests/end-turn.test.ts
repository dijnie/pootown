import { expect } from "chai";
import { setupTest, TestContext, getPlayerStatePDA } from "./utils/setup";
import { assertGameState } from "./utils/helpers";
import { TEST_CONSTANTS, GAME_STATUS } from "./utils/constants";
import { SystemProgram } from "@solana/web3.js";

describe("End Turn", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTest(3);
    
    // Setup complete game with 3 players
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

    for (let i = 0; i < 3; i++) {
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

  it("should advance turn to next player", async () => {
    // Verify initial turn is player 0
    const gameStateBefore = await ctx.program.account.gameState.fetch(ctx.gameAccount);
    expect(gameStateBefore.currentTurn).to.equal(0);

    await ctx.program.methods
      .endTurn()
      .accounts({
        game: ctx.gameAccount,
        player: ctx.players[0].publicKey,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .signers([ctx.players[0]])
      .rpc();

    // Verify turn advanced to player 1
    const gameStateAfter = await ctx.program.account.gameState.fetch(ctx.gameAccount);
    expect(gameStateAfter.currentTurn).to.equal(1);
  });

  it("should wrap around to first player after last player", async () => {
    // Advance to last player (player 2)
    await ctx.program.methods
      .endTurn()
      .accounts({
        game: ctx.gameAccount,
        player: ctx.players[0].publicKey,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .signers([ctx.players[0]])
      .rpc();

    await ctx.program.methods
      .endTurn()
      .accounts({
        game: ctx.gameAccount,
        player: ctx.players[1].publicKey,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .signers([ctx.players[1]])
      .rpc();

    // Now end turn for player 2, should wrap to player 0
    await ctx.program.methods
      .endTurn()
      .accounts({
        game: ctx.gameAccount,
        player: ctx.players[2].publicKey,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      })
      .signers([ctx.players[2]])
      .rpc();

    const gameState = await ctx.program.account.gameState.fetch(ctx.gameAccount);
    expect(gameState.currentTurn).to.equal(0);
  });
});