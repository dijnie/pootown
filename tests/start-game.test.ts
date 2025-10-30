import { expect } from "chai";
import { setupTest, TestContext, getPlayerStatePDA } from "./utils/setup";
import { assertGameState } from "./utils/helpers";
import { TEST_CONSTANTS, GAME_STATUS } from "./utils/constants";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";

export const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);

describe("Start Game", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTest(2);

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

    for (let i = 0; i < TEST_CONSTANTS.MIN_PLAYERS; i++) {
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
  });

  it("should successfully start game with minimum players", async () => {
    console.log("game acc", ctx.gameAccount.toBase58());

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
      console.log(
        "player seed",
        JSON.stringify([
          Buffer.from("player"),
          ctx.gameAccount.toBuffer(),
          player.toBuffer(),
        ])
      );
      console.log("player pda", playerPda.toBase58());
      const [playerBufferPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("buffer"), playerPda.toBuffer()],
        ctx.program.programId
      );
      remainingAccounts.push({
        pubkey: playerBufferPda,
        isSigner: false,
        isWritable: true,
      });
      console.log("player buffer pda", playerBufferPda.toBase58());

      const [delegationRecordPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("delegation"), playerPda.toBuffer()],
        DELEGATION_PROGRAM_ID
      );
      remainingAccounts.push({
        pubkey: delegationRecordPda,
        isSigner: false,
        isWritable: true,
      });
      console.log("delegation record pda", delegationRecordPda.toBase58());

      const [delegationMetadataPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("delegation-metadata"), playerPda.toBuffer()],
        DELEGATION_PROGRAM_ID
      );
      remainingAccounts.push({
        pubkey: delegationMetadataPda,
        isSigner: false,
        isWritable: true,
      });
      console.log("delegation metadata pda", delegationMetadataPda.toBase58());
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

    // console.dir(tx, { depth: null });

    const txHash = await ctx.provider.sendAndConfirm(tx, [ctx.authority], {
      skipPreflight: true,
      commitment: "confirmed",
    });

    console.log("Transaction signature:", txHash);

    await assertGameState(
      ctx,
      GAME_STATUS.IN_PROGRESS,
      TEST_CONSTANTS.MIN_PLAYERS + 1
    );

    gameState = await ctx.program.account.gameState.fetch(ctx.gameAccount);
    expect(gameState.currentTurn).to.equal(0); // First player's turn
  });

  it.skip("should set correct turn start timestamp", async () => {
    const beforeTime = Math.floor(Date.now() / 1000);

    await ctx.program.methods
      .startGame()
      .accountsPartial({
        game: ctx.gameAccount,
        authority: ctx.authority.publicKey,
      })
      .signers([ctx.authority])
      .rpc();

    const afterTime = Math.floor(Date.now() / 1000);
    const gameState = await ctx.program.account.gameState.fetch(
      ctx.gameAccount
    );

    expect(gameState.turnStartedAt.toNumber()).to.be.at.least(beforeTime - 5);
    expect(gameState.turnStartedAt.toNumber()).to.be.at.most(afterTime + 5);
  });
});
