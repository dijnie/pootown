#!/bin/bash

solana-test-validator \
  --reset \
  --clone mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev \
  --clone EpJnX7ueXk7fKojBymqmVuCuwyhDQsYcLVL1XMsBbvDX \
  --clone 7JrkjmZPprHwtuvtuGTXp9hwfGYFAQLnLeFM52kqAgXg \
  --clone-upgradeable-program DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh \
  --url https://api.devnet.solana.com \
   &

RUST_LOG=info ephemeral-validator \
  --accounts-lifecycle ephemeral \
  --remote-cluster development \
  --remote-url http://127.0.0.1:8899 \
  --remote-ws-url ws://127.0.0.1:8900 \
  --rpc-port 7799