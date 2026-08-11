import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PandaMonopoly } from "../../target/types/panda_monopoly";

type ExpectedLifecycle = {
  initial: {
    status: string;
    currentPlayers: number;
    playersLength: number;
    maximumPlayers: number;
    startingInMatchCash: number;
    bankBalance: number;
    housesRemaining: number;
    hotelsRemaining: number;
    entryFee: number;
    totalPrizePool: number;
  };
  afterJoins: {
    currentPlayers: number;
    playersLength: number;
    activePlayers: number;
    totalPlayers: number;
    event: {
      name: string;
      count: number;
      playerIndexes: number[];
      totalPlayers: number[];
    };
  };
  rejections: Record<string, string>;
  cancelled: {
    gameClosed: boolean;
    playerStatesClosed: boolean;
    event: { name: string; playersCount: number; refundAmount: number };
  };
};

type NodeWallet = anchor.Wallet & { payer: Keypair };

const expected = JSON.parse(
  readFileSync(
    resolve(__dirname, "../fixtures/executed-rules/lifecycle.json"),
    "utf8"
  )
) as ExpectedLifecycle;

const GAME_AUTHORITY_SEED = Buffer.from("game_authority");
const TOKEN_VAULT_SEED = Buffer.from("token_vault");
const legacyErrorByOutcome: Record<string, string> = {
  minimumPlayersNotMet: "Minimum number of players not met",
  unauthorizedCreator: "Unauthorized action",
  unauthorizedPlatformAdmin: "A raw constraint was violated",
  duplicateSeatRejected: "already in use",
  maximumPlayersReached: "Maximum number of players reached",
};

function variantName(value: Record<string, unknown>): string {
  return Object.keys(value)[0];
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}\n${
      "logs" in error && Array.isArray(error.logs) ? error.logs.join("\n") : ""
    }`;
  }
  return String(error);
}

async function expectRejected(
  action: () => Promise<unknown>,
  outcome: string
): Promise<void> {
  const legacyError = legacyErrorByOutcome[outcome];
  expect(legacyError, `Unknown rejection outcome: ${outcome}`).to.be.a(
    "string"
  );
  let rejection: unknown;
  try {
    await action();
  } catch (error) {
    rejection = error;
  }
  expect(rejection, `Expected rejection outcome: ${outcome}`).to.not.equal(
    undefined
  );
  expect(errorText(rejection).toLowerCase()).to.include(
    legacyError.toLowerCase()
  );
}

describe("executed Anchor lifecycle", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.pandaMonopoly as Program<PandaMonopoly>;
  const payer = (provider.wallet as NodeWallet).payer;

  async function fund(keypair: Keypair): Promise<void> {
    const signature = await provider.connection.requestAirdrop(
      keypair.publicKey,
      5 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature, "confirmed");
  }

  async function playerTokenAccount(
    mint: PublicKey,
    player: Keypair
  ): Promise<PublicKey> {
    return (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        mint,
        player.publicKey
      )
    ).address;
  }

  async function transactionEvents(
    signature: string
  ): Promise<Array<{ name: string; data: Record<string, unknown> }>> {
    let logMessages: string[] | null | undefined;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const transaction = await provider.connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      logMessages = transaction?.meta?.logMessages;
      if (logMessages) {
        break;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
    expect(logMessages, signature).to.be.an("array");
    const parser = new anchor.EventParser(program.programId, program.coder);
    return Array.from(parser.parseLogs(logMessages ?? [])) as Array<{
      name: string;
      data: Record<string, unknown>;
    }>;
  }

  it("records initialization, seating rejections, and cancellation", async () => {
    const creator = Keypair.generate();
    const joiners = Array.from({ length: 4 }, () => Keypair.generate());
    const unauthorizedAdmin = Keypair.generate();
    await Promise.all(
      [creator, ...joiners, unauthorizedAdmin].map((signer) => fund(signer))
    );

    const platformId = Keypair.generate().publicKey;
    const feeVault = Keypair.generate().publicKey;
    const [config] = PublicKey.findProgramAddressSync(
      [Buffer.from("platform"), platformId.toBuffer()],
      program.programId
    );

    await program.methods
      .createPlatformConfig(platformId, 500, feeVault)
      .accountsPartial({
        admin: creator.publicKey,
        config,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    await expectRejected(
      () =>
        program.methods
          .updatePlatformConfig(250, null)
          .accountsPartial({
            admin: unauthorizedAdmin.publicKey,
            config,
          })
          .signers([unauthorizedAdmin])
          .rpc(),
      expected.rejections.unauthorizedPlatformUpdate
    );

    const mint = await createMint(
      provider.connection,
      payer,
      provider.publicKey,
      null,
      6
    );
    const creatorTokenAccount = await playerTokenAccount(mint, creator);
    const configState = await program.account.platformConfig.fetch(config);
    const [game] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("game"),
        platformId.toBuffer(),
        configState.nextGameId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const [creatorState] = PublicKey.findProgramAddressSync(
      [Buffer.from("player"), game.toBuffer(), creator.publicKey.toBuffer()],
      program.programId
    );
    const [gameAuthority] = PublicKey.findProgramAddressSync(
      [GAME_AUTHORITY_SEED],
      program.programId
    );
    const [tokenVault] = PublicKey.findProgramAddressSync(
      [TOKEN_VAULT_SEED, mint.toBuffer(), game.toBuffer()],
      program.programId
    );

    await program.methods
      .initializeGame(new anchor.BN(0), null)
      .accountsPartial({
        game,
        playerState: creatorState,
        creator: creator.publicKey,
        config,
        gameAuthority,
        tokenMint: mint,
        creatorTokenAccount,
        tokenVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const initialized = await program.account.gameState.fetch(game);
    const initializedCreator = await program.account.playerState.fetch(
      creatorState
    );
    expect(variantName(initialized.gameStatus)).to.equal(
      expected.initial.status
    );
    expect(initialized.currentPlayers).to.equal(
      expected.initial.currentPlayers
    );
    expect(initialized.players).to.have.length(expected.initial.playersLength);
    expect(initialized.maxPlayers).to.equal(expected.initial.maximumPlayers);
    expect(initializedCreator.cashBalance.toNumber()).to.equal(
      expected.initial.startingInMatchCash
    );
    expect(initialized.bankBalance.toNumber()).to.equal(
      expected.initial.bankBalance
    );
    expect(initialized.housesRemaining).to.equal(
      expected.initial.housesRemaining
    );
    expect(initialized.hotelsRemaining).to.equal(
      expected.initial.hotelsRemaining
    );
    expect(initialized.entryFee.toNumber()).to.equal(expected.initial.entryFee);
    expect(initialized.totalPrizePool.toNumber()).to.equal(
      expected.initial.totalPrizePool
    );

    await expectRejected(
      () =>
        program.methods
          .startGame()
          .accountsPartial({ game, authority: creator.publicKey })
          .signers([creator])
          .rpc(),
      expected.rejections.prematureStart
    );

    const playerStates: PublicKey[] = [creatorState];
    const joinEvents: Array<{ name: string; data: Record<string, unknown> }> =
      [];
    for (const joiner of joiners.slice(0, 3)) {
      const [playerState] = PublicKey.findProgramAddressSync(
        [Buffer.from("player"), game.toBuffer(), joiner.publicKey.toBuffer()],
        program.programId
      );
      playerStates.push(playerState);
      const joinSignature = await program.methods
        .joinGame()
        .accountsPartial({
          game,
          playerState,
          player: joiner.publicKey,
          gameAuthority,
          tokenMint: mint,
          playerTokenAccount: await playerTokenAccount(mint, joiner),
          tokenVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([joiner])
        .rpc();
      joinEvents.push(...(await transactionEvents(joinSignature)));
    }

    const seated = await program.account.gameState.fetch(game);
    expect(seated.currentPlayers).to.equal(expected.afterJoins.currentPlayers);
    expect(seated.players).to.have.length(expected.afterJoins.playersLength);
    expect(seated.activePlayers).to.equal(expected.afterJoins.activePlayers);
    expect(seated.totalPlayers).to.equal(expected.afterJoins.totalPlayers);
    const playerJoinedEvents = joinEvents.filter(
      (event) => event.name === expected.afterJoins.event.name
    );
    expect(playerJoinedEvents).to.have.length(expected.afterJoins.event.count);
    expect(
      playerJoinedEvents.map((event) => event.data.playerIndex)
    ).to.deep.equal(expected.afterJoins.event.playerIndexes);
    expect(
      playerJoinedEvents.map((event) => event.data.totalPlayers)
    ).to.deep.equal(expected.afterJoins.event.totalPlayers);

    await expectRejected(
      () =>
        program.methods
          .startGame()
          .accountsPartial({ game, authority: unauthorizedAdmin.publicKey })
          .signers([unauthorizedAdmin])
          .rpc(),
      expected.rejections.unauthorizedStart
    );

    const duplicate = joiners[0];
    const duplicateTokenAccount = await playerTokenAccount(mint, duplicate);
    await expectRejected(
      () =>
        program.methods
          .joinGame()
          .accountsPartial({
            game,
            playerState: playerStates[1],
            player: duplicate.publicKey,
            gameAuthority,
            tokenMint: mint,
            playerTokenAccount: duplicateTokenAccount,
            tokenVault,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([duplicate])
          .rpc(),
      expected.rejections.duplicateJoin
    );

    const overflowPlayer = joiners[3];
    const overflowTokenAccount = await playerTokenAccount(mint, overflowPlayer);
    const [overflowState] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("player"),
        game.toBuffer(),
        overflowPlayer.publicKey.toBuffer(),
      ],
      program.programId
    );
    await expectRejected(
      () =>
        program.methods
          .joinGame()
          .accountsPartial({
            game,
            playerState: overflowState,
            player: overflowPlayer.publicKey,
            gameAuthority,
            tokenMint: mint,
            playerTokenAccount: overflowTokenAccount,
            tokenVault,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([overflowPlayer])
          .rpc(),
      expected.rejections.fullJoin
    );

    const cancelSignature = await program.methods
      .cancelGame()
      .accountsPartial({
        game,
        creator: creator.publicKey,
        gameAuthority,
        tokenMint: mint,
        tokenVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(
        seated.players.flatMap((wallet, index) => [
          { pubkey: playerStates[index], isSigner: false, isWritable: true },
          { pubkey: wallet, isSigner: false, isWritable: true },
        ])
      )
      .signers([creator])
      .rpc();

    const cancelEvents = await transactionEvents(cancelSignature);
    const cancelledEvent = cancelEvents.find(
      (event) => event.name === expected.cancelled.event.name
    );
    expect(cancelledEvent, expected.cancelled.event.name).to.not.equal(
      undefined
    );
    expect(cancelledEvent?.data.playersCount).to.equal(
      expected.cancelled.event.playersCount
    );
    expect(
      (cancelledEvent?.data.refundAmount as anchor.BN).toNumber()
    ).to.equal(expected.cancelled.event.refundAmount);

    expect(await program.account.gameState.fetchNullable(game)).to.equal(
      expected.cancelled.gameClosed ? null : undefined
    );
    for (const playerState of playerStates) {
      expect(
        await program.account.playerState.fetchNullable(playerState)
      ).to.equal(expected.cancelled.playerStatesClosed ? null : undefined);
    }
  });
});
