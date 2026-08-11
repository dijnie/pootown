"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { useGameWalletStatus } from "./use-game-wallet-status";
import { useWallet } from "./use-wallet";

export function useGameWalletCheck() {
  const { authenticated } = useWallet();
  const gameWalletStatus = useGameWalletStatus();

  const checkGameWallet = useCallback((onShowDialog: () => void) => {
    // First check if user is connected to Privy
    if (!authenticated) {
      toast.error("Please connect your wallet first.");
      return false;
    }
    
    // If user is authenticated but needs game wallet setup or delegation
    if (gameWalletStatus.needsSetup || gameWalletStatus.needsDelegation) {
      onShowDialog();
      return false;
    }
    
    return true;
  }, [authenticated, gameWalletStatus]);

  return {
    checkGameWallet,
    gameWalletStatus,
  };
}
