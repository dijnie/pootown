import { expect } from "chai";
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PandaMonopoly } from "../target/types/panda_monopoly";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";

describe("Platform Configuration", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.pandaMonopoly as Program<PandaMonopoly>;

  // let admin: Keypair;
  let platformId: PublicKey;
  let feeVault: Keypair;
  let configAccount: PublicKey;
  let configBump: number;

  beforeEach(async () => {
    // admin = Keypair.generate();
    platformId = Keypair.generate().publicKey;
    feeVault = Keypair.generate();

    console.log("platformId", platformId.toBase58());

    // await provider.connection.confirmTransaction(
    //   await provider.connection.requestAirdrop(
    //     admin.publicKey,
    //     10 * anchor.web3.LAMPORTS_PER_SOL
    //   )
    // );

    [configAccount, configBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("platform"), platformId.toBuffer()],
      program.programId
    );
  });

  describe("create_platform_config", () => {
    it("should successfully create a new platform config", async () => {
      const feeBasisPoints = 500; // 5%

      const tx = await program.methods
        .createPlatformConfig(platformId, feeBasisPoints, feeVault.publicKey)
        .accountsPartial({
          admin: provider.publicKey,
          config: configAccount,
          systemProgram: SystemProgram.programId,
        })
        // .signers([admin])
        .rpc();

      console.log("Transaction signature:", tx);

      // Fetch and verify the created config
      const configState = await program.account.platformConfig.fetch(
        configAccount
      );

      expect(configState.id.toString()).to.equal(platformId.toString());
      expect(configState.feeBasisPoints).to.equal(feeBasisPoints);
      expect(configState.feeVault.toString()).to.equal(
        feeVault.publicKey.toString()
      );
      // expect(configState.authority.toString()).to.equal(
      //   admin.publicKey.toString()
      // );
      expect(configState.totalGamesCreated.toNumber()).to.equal(0);
      expect(configState.nextGameId.toNumber()).to.equal(1);
      expect(configState.bump).to.equal(configBump);
    });

    // it("should create platform config with zero fee", async () => {
    //   const feeBasisPoints = 0; // 0%

    //   await program.methods
    //     .createPlatformConfig(platformId, feeBasisPoints, feeVault.publicKey)
    //     .accountsPartial({
    //       admin: admin.publicKey,
    //       config: configAccount,
    //       systemProgram: SystemProgram.programId,
    //     })
    //     .signers([admin])
    //     .rpc();

    //   const configState = await program.account.platformConfig.fetch(
    //     configAccount
    //   );
    //   expect(configState.feeBasisPoints).to.equal(0);
    // });

    // it("should create platform config with maximum fee", async () => {
    //   const feeBasisPoints = 10000; // 100%

    //   await program.methods
    //     .createPlatformConfig(platformId, feeBasisPoints, feeVault.publicKey)
    //     .accountsPartial({
    //       admin: admin.publicKey,
    //       config: configAccount,
    //       systemProgram: SystemProgram.programId,
    //     })
    //     .signers([admin])
    //     .rpc();

    //   const configState = await program.account.platformConfig.fetch(
    //     configAccount
    //   );
    //   expect(configState.feeBasisPoints).to.equal(10000);
    // });

    // it("should handle init_if_needed correctly for existing config", async () => {
    //   const feeBasisPoints = 250; // 2.5%

    //   // Create the config first time
    //   await program.methods
    //     .createPlatformConfig(platformId, feeBasisPoints, feeVault.publicKey)
    //     .accountsPartial({
    //       admin: admin.publicKey,
    //       config: configAccount,
    //       systemProgram: SystemProgram.programId,
    //     })
    //     .signers([admin])
    //     .rpc();

    //   // Try to create again with different parameters - should not overwrite
    //   const newFeeVault = Keypair.generate();
    //   const newFeeBasisPoints = 750; // 7.5%

    //   await program.methods
    //     .createPlatformConfig(
    //       platformId,
    //       newFeeBasisPoints,
    //       newFeeVault.publicKey
    //     )
    //     .accountsPartial({
    //       admin: admin.publicKey,
    //       config: configAccount,
    //       systemProgram: SystemProgram.programId,
    //     })
    //     .signers([admin])
    //     .rpc();

    //   // Verify original values are preserved (init_if_needed doesn't reinitialize)
    //   const configState = await program.account.platformConfig.fetch(
    //     configAccount
    //   );
    //   expect(configState.feeBasisPoints).to.equal(feeBasisPoints); // Original value
    //   expect(configState.feeVault.toString()).to.equal(
    //     feeVault.publicKey.toString()
    //   ); // Original value
    // });

    // it("should correctly calculate fees", async () => {
    //   const feeBasisPoints = 500; // 5%

    //   await program.methods
    //     .createPlatformConfig(platformId, feeBasisPoints, feeVault.publicKey)
    //     .accountsPartial({
    //       admin: admin.publicKey,
    //       config: configAccount,
    //       systemProgram: SystemProgram.programId,
    //     })
    //     .signers([admin])
    //     .rpc();

    //   const configState = await program.account.platformConfig.fetch(
    //     configAccount
    //   );

    //   // Test fee calculation logic (this would be done in the program, but we can verify the basis points)
    //   const testAmount = 1000;
    //   const expectedFee = (testAmount * feeBasisPoints) / 10000;
    //   expect(expectedFee).to.equal(50); // 5% of 1000 = 50
    // });

    // it("should create config with different platform IDs", async () => {
    //   const platformId2 = Keypair.generate().publicKey;
    //   const [configAccount2] = PublicKey.findProgramAddressSync(
    //     [Buffer.from("platform"), platformId2.toBuffer()],
    //     program.programId
    //   );

    //   // Create first platform config
    //   await program.methods
    //     .createPlatformConfig(platformId, 300, feeVault.publicKey)
    //     .accountsPartial({
    //       admin: admin.publicKey,
    //       config: configAccount,
    //       systemProgram: SystemProgram.programId,
    //     })
    //     .signers([admin])
    //     .rpc();

    //   // Create second platform config
    //   await program.methods
    //     .createPlatformConfig(platformId2, 700, feeVault.publicKey)
    //     .accountsPartial({
    //       admin: admin.publicKey,
    //       config: configAccount2,
    //       systemProgram: SystemProgram.programId,
    //     })
    //     .signers([admin])
    //     .rpc();

    //   // Verify both configs exist and are different
    //   const config1 = await program.account.platformConfig.fetch(configAccount);
    //   const config2 = await program.account.platformConfig.fetch(
    //     configAccount2
    //   );

    //   expect(config1.id.toString()).to.equal(platformId.toString());
    //   expect(config2.id.toString()).to.equal(platformId2.toString());
    //   expect(config1.feeBasisPoints).to.equal(300);
    //   expect(config2.feeBasisPoints).to.equal(700);
    // });

    // it("should set correct initial values", async () => {
    //   const feeBasisPoints = 1000; // 10%

    //   await program.methods
    //     .createPlatformConfig(platformId, feeBasisPoints, feeVault.publicKey)
    //     .accountsPartial({
    //       admin: admin.publicKey,
    //       config: configAccount,
    //       systemProgram: SystemProgram.programId,
    //     })
    //     .signers([admin])
    //     .rpc();

    //   const configState = await program.account.platformConfig.fetch(
    //     configAccount
    //   );

    //   // Verify all initial values are set correctly
    //   expect(configState.id.toString()).to.equal(platformId.toString());
    //   expect(configState.feeBasisPoints).to.equal(feeBasisPoints);
    //   expect(configState.feeVault.toString()).to.equal(
    //     feeVault.publicKey.toString()
    //   );
    //   expect(configState.authority.toString()).to.equal(
    //     admin.publicKey.toString()
    //   );
    //   expect(configState.totalGamesCreated.toNumber()).to.equal(0);
    //   expect(configState.nextGameId.toNumber()).to.equal(1);
    //   expect(configState.bump).to.equal(configBump);
    // });
  });
});
