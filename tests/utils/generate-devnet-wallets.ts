import { Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

/**
 * Script to generate devnet-wallets.json template
 * 
 * Usage:
 * 1. Run this script to generate the template
 * 2. Fund the generated wallets on devnet
 * 3. Use them in your tests
 */

function generateDevnetWallets() {
  const authority = Keypair.generate();
  const feeVault = Keypair.generate();
  const players = [];

  // Generate 4 player wallets (you can adjust this number)
  for (let i = 0; i < 4; i++) {
    players.push(Keypair.generate());
  }

  const walletsData = {
    authority: Array.from(authority.secretKey),
    players: players.map(player => Array.from(player.secretKey)),
    feeVault: Array.from(feeVault.secretKey)
  };

  const outputPath = path.join(__dirname, 'devnet-wallets.json');
  fs.writeFileSync(outputPath, JSON.stringify(walletsData, null, 2));

  console.log('Generated devnet-wallets.json with the following addresses:');
  console.log('Authority:', authority.publicKey.toString());
  console.log('Fee Vault:', feeVault.publicKey.toString());
  console.log('Players:');
  players.forEach((player, index) => {
    console.log(`  Player ${index + 1}:`, player.publicKey.toString());
  });
  console.log('\nPlease fund these wallets on devnet before running tests!');
  console.log('You can use the Solana CLI or devnet faucet to fund them.');
}

if (require.main === module) {
  generateDevnetWallets();
}

export { generateDevnetWallets };