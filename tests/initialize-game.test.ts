import { expect } from "chai";
import { setupTest, TestContext } from "./utils/setup";
import { assertGameState } from "./utils/helpers";
import { TEST_CONSTANTS, GAME_STATUS } from "./utils/constants";
import { SystemProgram } from "@solana/web3.js";

describe("Initialize Game", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTest();
  });

  it("should successfully initialize a new game", async () => {
    const tx = await ctx.program.methods
      .initializeGame()
      .accountsPartial({
        game: ctx.gameAccount,
        playerState: ctx.playerAccount,
        config: ctx.configAccount,
        authority: ctx.authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.authority])
      .rpc();

    console.log("tx", tx);

    // Verify game state
    await assertGameState(ctx, GAME_STATUS.WAITING_FOR_PLAYERS, 1);

    const gameState = await ctx.program.account.gameState.fetch(
      ctx.gameAccount
    );
    expect(gameState.maxPlayers).to.equal(TEST_CONSTANTS.MAX_PLAYERS);
    expect(gameState.housesRemaining).to.equal(TEST_CONSTANTS.TOTAL_HOUSES);
    expect(gameState.hotelsRemaining).to.equal(TEST_CONSTANTS.TOTAL_HOTELS);
    // expect(gameState.isActive).to.be.true;
    expect(gameState.bankBalance.toNumber()).to.equal(1000000);
  });

  it.skip("should initialize game with correct timestamp", async () => {
    const beforeTime = Math.floor(Date.now() / 1000);

    const tx = await ctx.program.methods
      .initializeGame()
      .accountsPartial({
        game: ctx.gameAccount,
        authority: ctx.authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.authority])
      .rpc();

    console.log("tx", tx);

    const afterTime = Math.floor(Date.now() / 1000);
    const gameState = await ctx.program.account.gameState.fetch(
      ctx.gameAccount
    );

    expect(gameState.createdAt.toNumber()).to.be.at.least(beforeTime - 5);
    expect(gameState.createdAt.toNumber()).to.be.at.most(afterTime + 5);
  });
});
