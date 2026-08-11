"use client";

import { usePrivy, WalletWithMetadata } from "@privy-io/react-auth";

export function useGameWallet() {
    const {ready, authenticated, user } = usePrivy();

    if (!ready || !authenticated || !user) return null;

    const gameWallet = 
       user?.linkedAccounts?.find(
          (account) =>
            (account as WalletWithMetadata).chainType === "solana" &&
            (account as WalletWithMetadata).connectorType === "embedded"
        ) as WalletWithMetadata | undefined;

    return {
        gameWalletAddress: gameWallet?.address,
        gameWalletId: gameWallet?.id,
        isDelegated: gameWallet?.delegated
    }
}