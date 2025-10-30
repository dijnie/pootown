import { expect } from "chai";
import { setupTest, TestContext, getPlayerStatePDA } from "./utils/setup";
import { assertGameState } from "./utils/helpers";
import {
  TEST_CONSTANTS,
  GAME_STATUS,
  DELEGATION_PROGRAM_ID,
} from "./utils/constants";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
} from "@solana/web3.js";

describe("Roll Dice", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTest(1);

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

    for (let i = 0; i < 1; i++) {
      const [playerStateAccount] = getPlayerStatePDA(
        ctx.program,
        ctx.gameAccount,
        ctx.players[i].publicKey
      );

      await ctx.program.methods
        .joinGame()
        .accountsPartial({
          game: ctx.gameAccount,
          playerState: playerStateAccount,
          player: ctx.players[i].publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([ctx.players[i]])
        .rpc();
    }

    let gameState = await ctx.program.account.gameState.fetch(ctx.gameAccount);
    let remainingAccounts = [];

    console.log("player count", gameState.players.length);

    gameState.players.forEach((player) => {
      const [playerPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("player"), ctx.gameAccount.toBuffer(), player.toBuffer()],
        ctx.program.programId
      );

      remainingAccounts.push({
        pubkey: playerPda,
        isSigner: false,
        isWritable: true,
      });

      const [playerBufferPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("buffer"), playerPda.toBuffer()],
        ctx.program.programId
      );

      remainingAccounts.push({
        pubkey: playerBufferPda,
        isSigner: false,
        isWritable: true,
      });

      const [delegationRecordPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("delegation"), playerPda.toBuffer()],
        DELEGATION_PROGRAM_ID
      );
      remainingAccounts.push({
        pubkey: delegationRecordPda,
        isSigner: false,
        isWritable: true,
      });

      const [delegationMetadataPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("delegation-metadata"), playerPda.toBuffer()],
        DELEGATION_PROGRAM_ID
      );

      remainingAccounts.push({
        pubkey: delegationMetadataPda,
        isSigner: false,
        isWritable: true,
      });
    });

    console.log("remaining accounts", remainingAccounts.length);

    let tx = await ctx.program.methods
      .startGame()
      .accountsPartial({
        game: ctx.gameAccount,
        authority: ctx.authority.publicKey,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 1_000_000,
        }),
      ])
      .remainingAccounts(remainingAccounts)
      .signers([ctx.authority])
      .transaction();

    tx.feePayer = ctx.provider.wallet.publicKey;
    tx.recentBlockhash = (
      await ctx.provider.connection.getLatestBlockhash()
    ).blockhash;
    tx = await ctx.providerER.wallet.signTransaction(tx);

    const txHash = await ctx.provider.sendAndConfirm(tx, [ctx.authority], {
      skipPreflight: true,
      commitment: "confirmed",
    });

    console.log("Start game tx:", txHash);

    await new Promise((resolve) => setTimeout(resolve, 3000));
  });

  it("should allow current player to roll dice", async () => {
    console.log("authority", ctx.authority.publicKey.toBase58());
    const [playerStateAccount] = getPlayerStatePDA(
      ctx.program,
      ctx.gameAccount,
      ctx.authority.publicKey
    );

    console.log("playerStateAccount", playerStateAccount.toBase58());
    console.log("game", ctx.gameAccount.toBase58());
    console.log("player", ctx.authority.publicKey.toBase58());

    const roll = Math.floor(Math.random() * 100) + 1;
    let tx = await ctx.program.methods
      .rollDice([1, 2], roll)
      .accountsPartial({
        game: ctx.gameAccount,
        playerState: playerStateAccount,
        player: ctx.authority.publicKey,
        recentBlockhashes: SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
        // oracleQueue: new PublicKey(
        //   "5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc"
        // ),
      })
      .signers([ctx.authority])
      .transaction();

    tx.feePayer = ctx.providerER.wallet.publicKey;
    tx.recentBlockhash = (
      await ctx.providerER.connection.getLatestBlockhash()
    ).blockhash;
    tx = await ctx.providerER.wallet.signTransaction(tx);

    const txHash = await ctx.providerER.sendAndConfirm(tx, [ctx.authority], {
      skipPreflight: true,
      commitment: "confirmed",
    });

    console.log("Roll dice tx:", txHash);

    // Verify game is still in progress
    await assertGameState(ctx, GAME_STATUS.IN_PROGRESS, 2);

    // Check that turn timestamp was updated
    const gameState = await ctx.program.account.gameState.fetch(
      ctx.gameAccount
    );
    expect(gameState.turnStartedAt.toNumber()).to.be.greaterThan(0);
  });

  // it.skip("should handle dice roll for non-jailed player", async () => {
  //   const [playerStateAccount] = getPlayerStatePDA(
  //     ctx.program,
  //     ctx.gameAccount,
  //     ctx.players[0].publicKey
  //   );

  //   // Verify player is not in jail initially
  //   const playerStateBefore = await ctx.program.account.playerState.fetch(
  //     playerStateAccount
  //   );
  //   expect(playerStateBefore.inJail).to.be.false;
  //   expect(playerStateBefore.doublesCount).to.equal(0);

  //   await ctx.program.methods
  //     .rollDice()
  //     .accountsPartial({
  //       game: ctx.gameAccount,
  //       playerState: playerStateAccount,
  //       player: ctx.players[0].publicKey,
  //       recentBlockhashes: SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
  //     })
  //     .signers([ctx.players[0]])
  //     .rpc();

  //   // Verify player state after roll
  //   const playerStateAfter = await ctx.program.account.playerState.fetch(
  //     playerStateAccount
  //   );
  //   expect(playerStateAfter.inJail).to.be.false;
  // });
});
