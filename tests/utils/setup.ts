import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PandaMonopoly } from "../../target/types/panda_monopoly";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

export interface TestContext {
  program: Program<PandaMonopoly>;
  provider: anchor.AnchorProvider;
  providerER: anchor.AnchorProvider;
  authority: Keypair;
  players: Keypair[];
  gameAccount: PublicKey;
  playerAccount: PublicKey;
  gameBump: number;
  platformId: PublicKey;
  configAccount: PublicKey;
}

export function isDevnet(provider: anchor.AnchorProvider): boolean {
  const endpoint = provider.connection.rpcEndpoint;
  return endpoint.includes("devnet") || endpoint.includes("magicblock");
}

async function setupEphemeralWallets(
  provider: anchor.AnchorProvider,
  numPlayers: number
) {
  const authority = Keypair.generate();
  const feeVault = Keypair.generate();
  const players: Keypair[] = [];

  for (let i = 0; i < numPlayers; i++) {
    players.push(Keypair.generate());
  }

  // Airdrop to authority
  await provider.connection.confirmTransaction(
    await provider.connection.requestAirdrop(
      authority.publicKey,
      10 * anchor.web3.LAMPORTS_PER_SOL
    )
  );

  // Airdrop to all players
  for (const player of players) {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        player.publicKey,
        10 * anchor.web3.LAMPORTS_PER_SOL
      )
    );
  }

  return { authority, players, feeVault };
}

export async function setupTest(numPlayers: number = 2): Promise<TestContext> {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  console.log(
    "process.env.EPHEMERAL_PROVIDER_ENDPOINT",
    process.env.EPHEMERAL_PROVIDER_ENDPOINT
  );
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

  const program = anchor.workspace.pandaMonopoly as Program<PandaMonopoly>;

  if (isDevnet(provider)) {
    throw new Error(
      "Legacy tests no longer load tracked or persistent devnet keypairs. Run them against a local validator so ephemeral keypairs can be generated and funded at runtime."
    );
  }

  const { authority, players, feeVault } = await setupEphemeralWallets(
    provider,
    numPlayers
  );

  // const platformId = Keypair.generate().publicKey;
  const platformId = new PublicKey(
    "WgiVLsEzAdk4DbmQDyJXMxBNTLvavseop31jtRgtdmc"
  );
  console.log("platformId:", platformId.toBase58());
  const feeBasisPoints = 500; // 5%

  // init platform
  // const [configAccount] = PublicKey.findProgramAddressSync(
  //   [Buffer.from("platform"), platformId.toBuffer()],
  //   program.programId
  // );
  const configAccount = new PublicKey(
    "9q9q2fe3LJQaFUNtxDaksHG8AMaVEJXGeunsuxLXAWK7"
  );
  console.log("configAccount:", configAccount.toBase58());

  // const tx = await program.methods
  //   .createPlatformConfig(platformId, feeBasisPoints, feeVault.publicKey)
  //   .accountsPartial({
  //     admin: authority.publicKey,
  //     config: configAccount,
  //     systemProgram: SystemProgram.programId,
  //   })
  //   .signers([authority])
  //   .rpc();

  // console.log("Tx init:", tx);

  const configState = await program.account.platformConfig.fetch(configAccount);

  const [gameAccount, gameBump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("game"),
      platformId.toBuffer(),
      configState.nextGameId.toArrayLike(Buffer, "le", 8),
    ],
    program.programId
  );
  // const gameAccount = new PublicKey(
  //   "5xuJfozAFSHhiMghL6gRuCMEsqrRAvNM3Pnrac4gSNho"
  // );

  console.log("gameAccount:", gameAccount.toBase58());

  const [playerAccount] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("player"),
      gameAccount.toBuffer(),
      authority.publicKey.toBuffer(),
    ],
    program.programId
  );
  // const playerAccount = new PublicKey(
  //   "6xLCCAfqJbQFZrjtH1xAJVFCmX4czWnzboNjfsbNYY7S"
  // );

  console.log("playerAccount:", playerAccount.toBase58());

  return {
    program,
    provider,
    providerER: providerEphemeralRollup,
    authority,
    players,
    gameAccount,
    playerAccount,
    gameBump: 1,
    platformId,
    configAccount,
  };
}

export function getPlayerStatePDA(
  program: Program<PandaMonopoly>,
  gameAccount: PublicKey,
  playerWallet: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("player"), gameAccount.toBuffer(), playerWallet.toBuffer()],
    program.programId
  );
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
