import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { expect } from "chai";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PandaMonopoly } from "../../target/types/panda_monopoly";

type NodeWallet = anchor.Wallet & { payer: Keypair };

type ExpectedStart = {
  before: { status: string; currentPlayers: number };
  attempt: {
    outcome: string;
    observedSteps: string[];
    event: { name: string; totalPlayers: number };
  };
  after: {
    status: string;
    stateCommitted: boolean;
    accountsRemainProgramOwned: number;
  };
};

const expected = JSON.parse(
  readFileSync(
    resolve(__dirname, "../fixtures/executed-rules/start.json"),
    "utf8"
  )
) as ExpectedStart;

const DELEGATION_PROGRAM_ID = new PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);

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

const legacyLogByStep: Record<string, string> = {
  gameDelegationSucceeded: "Program log: Start delegate",
  playerDelegationSucceeded: "delegated",
  gameStartedEventEmitted: "Program log: Game started!",
  postHandlerRuntimeAccessViolation: "Access violation in input section",
};

describe("executed Anchor start lifecycle", () => {
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

  it("records the rolled-back minimum-seat start attempt", async () => {
    const creator = Keypair.generate();
    const joiner = Keypair.generate();
    await Promise.all([fund(creator), fund(joiner)]);

    const platformId = Keypair.generate().publicKey;
    const [config] = PublicKey.findProgramAddressSync(
      [Buffer.from("platform"), platformId.toBuffer()],
      program.programId
    );
    await program.methods
      .createPlatformConfig(platformId, 0, Keypair.generate().publicKey)
      .accountsPartial({
        admin: creator.publicKey,
        config,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const mint = await createMint(
      provider.connection,
      payer,
      provider.publicKey,
      null,
      6
    );
    const creatorTokenAccount = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        mint,
        creator.publicKey
      )
    ).address;
    const joinerTokenAccount = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        mint,
        joiner.publicKey
      )
    ).address;

    const configState = await program.account.platformConfig.fetch(config);
    const [game] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("game"),
        platformId.toBuffer(),
        configState.nextGameId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );
    const playerStates = [creator, joiner].map(
      (player) =>
        PublicKey.findProgramAddressSync(
          [Buffer.from("player"), game.toBuffer(), player.publicKey.toBuffer()],
          program.programId
        )[0]
    );
    const [gameAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("game_authority")],
      program.programId
    );
    const [tokenVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_vault"), mint.toBuffer(), game.toBuffer()],
      program.programId
    );

    await program.methods
      .initializeGame(new anchor.BN(0), null)
      .accountsPartial({
        game,
        playerState: playerStates[0],
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

    await program.methods
      .joinGame()
      .accountsPartial({
        game,
        playerState: playerStates[1],
        player: joiner.publicKey,
        gameAuthority,
        tokenMint: mint,
        playerTokenAccount: joinerTokenAccount,
        tokenVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([joiner])
      .rpc();

    const waiting = await program.account.gameState.fetch(game);
    expect(variantName(waiting.gameStatus)).to.equal(expected.before.status);
    expect(waiting.currentPlayers).to.equal(expected.before.currentPlayers);

    const remainingAccounts = playerStates.flatMap((playerState) => {
      const [buffer] = PublicKey.findProgramAddressSync(
        [Buffer.from("buffer"), playerState.toBuffer()],
        program.programId
      );
      const [delegationRecord] = PublicKey.findProgramAddressSync(
        [Buffer.from("delegation"), playerState.toBuffer()],
        DELEGATION_PROGRAM_ID
      );
      const [delegationMetadata] = PublicKey.findProgramAddressSync(
        [Buffer.from("delegation-metadata"), playerState.toBuffer()],
        DELEGATION_PROGRAM_ID
      );
      return [
        { pubkey: playerState, isSigner: false, isWritable: true },
        { pubkey: buffer, isSigner: false, isWritable: true },
        { pubkey: delegationRecord, isSigner: false, isWritable: true },
        { pubkey: delegationMetadata, isSigner: false, isWritable: true },
      ];
    });
    const characterizedAccounts = [game, ...playerStates];
    const accountDataBefore = await Promise.all(
      characterizedAccounts.map(async (account) =>
        Buffer.from(
          (await provider.connection.getAccountInfo(account))?.data ?? []
        )
      )
    );

    let rejection: unknown;
    try {
      await program.methods
        .startGame()
        .accountsPartial({ game, authority: creator.publicKey })
        .remainingAccounts(remainingAccounts)
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
        ])
        .signers([creator])
        .rpc();
    } catch (error) {
      rejection = error;
    }
    expect(rejection, expected.attempt.outcome).to.not.equal(undefined);
    const rejectionText = errorText(rejection);
    for (const step of expected.attempt.observedSteps) {
      expect(rejectionText, step).to.include(legacyLogByStep[step]);
    }
    const rejectionLogs =
      rejection instanceof Error &&
      "logs" in rejection &&
      Array.isArray(rejection.logs)
        ? rejection.logs
        : [];
    const parser = new anchor.EventParser(program.programId, program.coder);
    const startedEvent = Array.from(parser.parseLogs(rejectionLogs)).find(
      (event) => event.name === expected.attempt.event.name
    );
    expect(startedEvent, expected.attempt.event.name).to.not.equal(undefined);
    expect(startedEvent?.data.totalPlayers).to.equal(
      expected.attempt.event.totalPlayers
    );

    const rolledBack = await program.account.gameState.fetch(game);
    expect(variantName(rolledBack.gameStatus)).to.equal(expected.after.status);
    const accountDataAfter = await Promise.all(
      characterizedAccounts.map(async (account) =>
        Buffer.from(
          (await provider.connection.getAccountInfo(account))?.data ?? []
        )
      )
    );
    const stateCommitted = accountDataAfter.some(
      (data, index) => !data.equals(accountDataBefore[index])
    );
    expect(stateCommitted).to.equal(expected.after.stateCommitted);

    const accountOwners = await Promise.all(
      characterizedAccounts.map(async (account) =>
        (await provider.connection.getAccountInfo(account))?.owner.toBase58()
      )
    );
    expect(
      accountOwners.filter((owner) => owner === program.programId.toBase58())
    ).to.have.length(expected.after.accountsRemainProgramOwned);
  });
});
