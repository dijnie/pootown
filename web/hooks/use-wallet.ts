"use client";

import {
  usePrivy,
  type PrivyInterface,
  type WalletWithMetadata,
} from "@privy-io/react-auth";
import { useConnectedStandardWallets } from "@privy-io/react-auth/solana";
import { address, TransactionSigner } from "@solana/kit";
import { useMemo } from "react";

export function useWallet() {
  const { user, ...rest } = usePrivy();
  const { wallets } = useConnectedStandardWallets();

  const gameWallet = useMemo(() => {
    const linkedAccount = user?.linkedAccounts?.find(
      (account) =>
        (account as WalletWithMetadata).chainType === "solana" &&
        (account as WalletWithMetadata).connectorType === "embedded"
    ) as WalletWithMetadata | undefined;

    return linkedAccount;
  }, [user, wallets]);

  return {
    wallet: gameWallet,
    signer: gameWallet ? { address: address(gameWallet.address) } as TransactionSigner : undefined,
    user,
    ...rest,
  } as PrivyInterface & {
    wallet: WalletWithMetadata | undefined;
    signer?: TransactionSigner;
  };
}
