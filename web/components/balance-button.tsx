"use client";

import { Button } from "@/components/ui/button";
import { useSolBalance } from "@/hooks/use-sol-balance";
import { WalletIcon } from "@/components/ui/icons";
import { DepositDialog } from "./deposit-dialog";
import { useState } from "react";
import { formatNumber } from "@/lib/utils";

interface BalanceButtonProps {
  walletAddress: string;
  className?: string;
}

export function BalanceButton({
  walletAddress,
  className,
}: BalanceButtonProps) {
  const { balanceInSol, isLoading, error } = useSolBalance(walletAddress);
  const [isDepositDialogOpen, setIsDepositDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <Button variant="neutral" size="default" className={className} disabled>
        <WalletIcon className="w-4 h-4 mr-2" />
        Loading...
      </Button>
    );
  }

  if (error) {
    return (
      <Button variant="neutral" size="default" className={className} disabled>
        <WalletIcon className="w-4 h-4 mr-2" />
        Error
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="neutral"
        size="default"
        className={className}
        onClick={() => setIsDepositDialogOpen(true)}
      >
        <WalletIcon className="w-4 h-4 mr-2" />
        {formatNumber(balanceInSol)} SOL
      </Button>

      <DepositDialog
        isOpen={isDepositDialogOpen}
        onClose={() => setIsDepositDialogOpen(false)}
        walletAddress={walletAddress}
      />
    </>
  );
}
