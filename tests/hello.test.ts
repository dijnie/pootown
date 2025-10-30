import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PandaMonopoly } from "../target/types/panda_monopoly";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { BN } from "bn.js";

const SEED_TEST_PDA = "test-pda"; // 5RgeA5P8bRaynJovch3zQURfJxXL3QK2JYg1YamSvyLb

describe("Hello", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const providerEphemeralRollup = new anchor.AnchorProvider(
    new anchor.web3.Connection(
      process.env.EPHEMERAL_PROVIDER_ENDPOINT ||
        "https://devnet-as.magicblock.app/",
      {
        wsEndpoint:
          process.env.EPHEMERAL_WS_ENDPOINT || "wss://devnet.magicblock.app/",
      }
    ),
    anchor.Wallet.local()
  );
  const id = Date.now();
  const program = anchor.workspace.pandaMonopoly as Program<PandaMonopoly>;
  const [pda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(SEED_TEST_PDA), new BN(id).toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  console.log("Program ID: ", program.programId.toString());
  console.log("Counter PDA: ", pda.toString());

  //   let admin: Keypair;
  //   let platformId: PublicKey;
  //   let feeVault: Keypair;
  //   let configAccount: PublicKey;
  //   let configBump: number;

  //   beforeEach(async () => {
  //     admin = Keypair.generate();
  //     platformId = Keypair.generate().publicKey;
  //     feeVault = Keypair.generate();

  //     await provider.connection.confirmTransaction(
  //       await provider.connection.requestAirdrop(
  //         admin.publicKey,
  //         10 * anchor.web3.LAMPORTS_PER_SOL
  //       )
  //     );

  //     [configAccount, configBump] = PublicKey.findProgramAddressSync(
  //       [Buffer.from("platform"), platformId.toBuffer()],
  //       program.programId
  //     );
  //   });

  before(async function () {
    const balance = await provider.connection.getBalance(
      anchor.Wallet.local().publicKey
    );
    console.log("Current balance is", balance / LAMPORTS_PER_SOL, " SOL", "\n");
  });

  it("Initialize counter on Solana", async () => {
    const start = Date.now();
    const txHash = await program.methods
      .initialize(new BN(id))
      .accounts({
        // @ts-ignore
        counter: pda,
        user: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc({ skipPreflight: true });
    const duration = Date.now() - start;
    console.log(`${duration}ms (Base Layer) Initialize txHash: ${txHash}`);
  });

  it("Increase counter on Solana", async () => {
    const start = Date.now();
    const txHash = await program.methods
      .increment()
      .accounts({
        counter: pda,
      })
      .rpc();
    const duration = Date.now() - start;
    console.log(`${duration}ms (Base Layer) Increment txHash: ${txHash}`);
  });

  it("Delegate counter to ER", async () => {
    const start = Date.now();
    let tx = await program.methods
      .delegate()
      .accountsPartial({
        payer: provider.wallet.publicKey,
        pda: pda,
      })
      .transaction();
    tx.feePayer = provider.wallet.publicKey;
    tx.recentBlockhash = (
      await provider.connection.getLatestBlockhash()
    ).blockhash;
    tx = await providerEphemeralRollup.wallet.signTransaction(tx);
    const txHash = await provider.sendAndConfirm(tx, [], {
      skipPreflight: true,
      commitment: "confirmed",
    });
    const duration = Date.now() - start;
    console.log(`${duration}ms (Base Layer) Delegate txHash: ${txHash}`);
  });
});
