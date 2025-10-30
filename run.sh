#!/bin/bash
set -e  # stop script if any command fails

# Build and deploy Anchor program
anchor build
anchor deploy --provider.cluster localnet

# Airdrop SOL to two accounts
solana airdrop 10 6weuckp6opHVSNpU4Xt3ogxLTGFLY6JJotSVEkYaMNWp
solana airdrop 10 FNNABCPYdX2AC4WivKPm9SRVugVPXaJMZKaeCz8BC55f

# Move into web folder and run script
cd web
node codama.mjs
