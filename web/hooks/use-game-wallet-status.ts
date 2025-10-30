"use client";

import { useWallet } from "./use-wallet";
import { useMemo } from "react";

export type GameWalletStatus = {
  hasWallet: boolean;
  isDelegated: boolean;
  isReady: boolean;
  needsSetup: boolean;
  needsDelegation: boolean;
};

export function useGameWalletStatus(): GameWalletStatus {
  const { wallet, authenticated } = useWallet();

  return useMemo(() => {
    // hasWallet = check if game wallet exists (embedded wallet)
    const hasWallet = !!wallet?.address;
    const isDelegated = !!wallet?.delegated;
    const isReady = hasWallet && isDelegated;
    const needsSetup = !hasWallet;
    const needsDelegation = hasWallet && !isDelegated;

    return {
      hasWallet,
      isDelegated,
      isReady,
      needsSetup,
      needsDelegation,
    };
  }, [wallet, authenticated]);
}
