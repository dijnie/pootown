import { setupTest, TestContext, getPlayerStatePDA } from "./utils/setup";
import { assertGameState, assertPlayerState } from "./utils/helpers";
import { TEST_CONSTANTS, GAME_STATUS } from "./utils/constants";
import { SystemProgram } from "@solana/web3.js";

describe("Join Game", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTest(3);

    await ctx.program.methods
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
  });

  it("should allow first player to join game", async () => {
    const [playerStateAccount] = getPlayerStatePDA(
      ctx.program,
      ctx.gameAccount,
      ctx.players[0].publicKey
    );

    await ctx.program.methods
      .joinGame()
      .accountsPartial({
        game: ctx.gameAccount,
        playerState: playerStateAccount,
        player: ctx.players[0].publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.players[0]])
      .rpc();

    // Verify game state updated
    await assertGameState(ctx, GAME_STATUS.WAITING_FOR_PLAYERS, 2);

    // Verify player state
    await assertPlayerState(
      ctx,
      0,
      TEST_CONSTANTS.STARTING_MONEY,
      TEST_CONSTANTS.GO_POSITION
    );
  });

  it("should allow multiple players to join game", async () => {
    const [playerState1] = getPlayerStatePDA(
      ctx.program,
      ctx.gameAccount,
      ctx.players[0].publicKey
    );

    await ctx.program.methods
      .joinGame()
      .accountsPartial({
        game: ctx.gameAccount,
        playerState: playerState1,
        player: ctx.players[0].publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.players[0]])
      .rpc();

    // Join second player
    const [playerState2] = getPlayerStatePDA(
      ctx.program,
      ctx.gameAccount,
      ctx.players[1].publicKey
    );

    await ctx.program.methods
      .joinGame()
      .accountsPartial({
        game: ctx.gameAccount,
        playerState: playerState2,
        player: ctx.players[1].publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.players[1]])
      .rpc();

    // Verify both players joined
    await assertGameState(ctx, GAME_STATUS.WAITING_FOR_PLAYERS, 3);
    await assertPlayerState(
      ctx,
      0,
      TEST_CONSTANTS.STARTING_MONEY,
      TEST_CONSTANTS.GO_POSITION
    );
    await assertPlayerState(
      ctx,
      1,
      TEST_CONSTANTS.STARTING_MONEY,
      TEST_CONSTANTS.GO_POSITION
    );
  });
});
