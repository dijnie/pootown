"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useWallet } from "@/hooks/use-wallet";
import { useSolanaWallets } from "@privy-io/react-auth/solana";
import { useSessionSigners } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import envConfig from "@/configs/env";
import { useSolBalance } from "@/hooks/use-sol-balance";
import { DepositDialog } from "@/components/deposit-dialog";

type Step = "create" | "delegate" | "topup" | "complete";

interface CreateGameWalletDialogProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function CreateGameWalletDialog({
  isOpen: externalIsOpen,
  onClose: externalOnClose,
}: CreateGameWalletDialogProps = {}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>("create");
  const [isCreating, setIsCreating] = useState(false);
  const [isDelegating, setIsDelegating] = useState(false);
  const [isDepositDialogOpen, setIsDepositDialogOpen] = useState(false);

  const { authenticated, ready, wallet } = useWallet();
  const { createWallet } = useSolanaWallets();
  const { addSessionSigners } = useSessionSigners();
  const { balanceInSol, isLoading: isBalanceLoading, refetch: refetchBalance } = useSolBalance(wallet?.address);
  const MIN_SOL = 0.1;

  // Use external isOpen if provided, otherwise use internal state
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;

  const handleClose = () => {
    if (externalOnClose) {
      externalOnClose();
    } else {
      setInternalIsOpen(false);
    }
  };

  useEffect(() => {
    if (
      authenticated &&
      ready &&
      !wallet?.delegated &&
      externalIsOpen === undefined
    ) {
      setTimeout(() => {
        setInternalIsOpen(true);
      }, 300);
    }
  }, [authenticated, ready, wallet, externalIsOpen]);

  useEffect(() => {
    if (wallet && !wallet.delegated) {
      setCurrentStep("delegate");
    }
  }, [wallet]);

  const handleCreateWallet = async () => {
    try {
      setIsCreating(true);

      await createWallet();

      toast.success("Game wallet created successfully!");
      setCurrentStep("delegate");
    } catch (error) {
      console.error("Failed to create game wallet:", error);
      toast.error("Failed to create game wallet. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelegateWallet = async () => {
    if (!wallet) {
      toast.error("No game wallet found");
      return;
    }

    try {
      setIsDelegating(true);

      await addSessionSigners({
        address: wallet.address,
        signers: [
          {
            signerId: envConfig.NEXT_PUBLIC_AUTH_ID_PRIVY,
          },
        ],
        //   chainType: "solana",
      });

      toast.success("Game wallet delegated successfully!");

      // After delegation, check balance and route to topup if needed
      try {
        const newLamports = await refetchBalance();
        const newSol =
          typeof newLamports === "number"
            ? Number(newLamports) / 1_000_000_000
            : balanceInSol;

        if (newSol < MIN_SOL) {
          setCurrentStep("topup");
        } else {
          setCurrentStep("complete");
          setTimeout(() => {
            handleClose();
          }, 500);
        }
      } catch {
        // If balance check fails, proceed to complete to avoid blocking
        setCurrentStep("complete");
        setTimeout(() => {
          handleClose();
        }, 500);
      }
    } catch (error) {
      console.error("Failed to delegate game wallet:", error);
      toast.error("Failed to delegate game wallet. Please try again.");
    } finally {
      setIsDelegating(false);
    }
  };

  const handleSkipDelegation = () => {
    setCurrentStep("complete");
    setTimeout(() => {
      handleClose();
    }, 500);
  };

  const handleCheckBalanceAndProceed = async () => {
    try {
      const newLamports = await refetchBalance();
      const newSol =
        typeof newLamports === "number"
          ? Number(newLamports) / 1_000_000_000
          : balanceInSol;

      if (newSol >= MIN_SOL) {
        setCurrentStep("complete");
        setTimeout(() => {
          handleClose();
        }, 500);
      } else {
        toast.info("Balance is still below 0.1 SOL. Please top up.");
      }
    } catch {
      toast.error("Unable to refresh balance. Try again in a moment.");
    }
  };

  if (externalIsOpen === undefined && wallet && wallet.delegated && currentStep !== "topup") return null;

  const renderStepContent = () => {
    switch (currentStep) {
      case "create":
        return (
          <>
            <DialogHeader>
              <DialogTitle>Create Game Wallet</DialogTitle>
              <DialogDescription>
                To play the game, you need a dedicated game wallet. This wallet
                will be used for all in-game transactions and will improve your
                gaming experience.
              </DialogDescription>
            </DialogHeader>
            <div className="py-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 font-semibold">1</span>
                  </div>
                  <div>
                    <p className="font-medium">Create Game Wallet</p>
                    <p className="text-sm text-muted-foreground">
                      A secure wallet for your game transactions
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                    <span className="text-gray-600 font-semibold">2</span>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">
                      Delegate Wallet
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Allow seamless game transactions
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="neutral">Cancel</Button>
              </DialogClose>
              <Button onClick={handleCreateWallet} disabled={isCreating}>
                {isCreating && <Spinner className="mr-2 h-4 w-4" />}
                Create Game Wallet
              </Button>
            </DialogFooter>
          </>
        );

      case "delegate":
        return (
          <>
            <DialogHeader>
              <DialogTitle>Delegate Game Wallet</DialogTitle>
              <DialogDescription>
                To provide the best gaming experience, we recommend delegating
                your game wallet. This allows the game to sign transactions on
                your behalf, making gameplay seamless and fast.
              </DialogDescription>
            </DialogHeader>
            <div className="py-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-600 font-semibold">✓</span>
                  </div>
                  <div>
                    <p className="font-medium">Game Wallet Created</p>
                    <p className="text-sm text-muted-foreground">
                      Your game wallet is ready
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 font-semibold">2</span>
                  </div>
                  <div>
                    <p className="font-medium">Delegate Wallet</p>
                    <p className="text-sm text-muted-foreground">
                      Enable seamless transactions
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">
                  Benefits of delegation:
                </h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Faster gameplay without transaction confirmations</li>
                  <li>• Seamless property purchases and trades</li>
                  <li>• Automatic rent collection</li>
                  <li>• Enhanced user experience</li>
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button variant="neutral" onClick={handleSkipDelegation}>
                Skip for Now
              </Button>
              <Button onClick={handleDelegateWallet} disabled={isDelegating}>
                {isDelegating && <Spinner className="mr-2 h-4 w-4" />}
                Delegate Wallet
              </Button>
            </DialogFooter>
          </>
        );

      case "topup":
        return (
          <>
            <DialogHeader>
              <DialogTitle>Low Balance Detected</DialogTitle>
              <DialogDescription>
                Your game wallet is running on Solana Devnet. For smoother gameplay,
                we recommend having at least {MIN_SOL} SOL. Current balance:
                {isBalanceLoading ? (
                  <span className="ml-1 inline-flex items-center">
                    <Spinner className="h-4 w-4" />
                  </span>
                ) : (
                  <span className="ml-1 font-medium">{balanceInSol.toFixed(4)} SOL</span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="py-6 space-y-4">
              <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="text-sm text-yellow-800">
                  Tip: Use the Devnet faucet to receive free SOL, or deposit directly to your game wallet.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  variant="neutral"
                  onClick={() => setIsDepositDialogOpen(true)}
                >
                  Deposit SOL (QR)
                </Button>
                <Button
                  onClick={() => window.open("https://faucet.solana.com/", "_blank")}
                >
                  Open Devnet Faucet
                </Button>
              </div>
              <div className="flex justify-between gap-2">
                <Button variant="neutral" onClick={handleSkipDelegation}>
                  Skip for Now
                </Button>
                <Button onClick={handleCheckBalanceAndProceed}>
                  I topped up, check balance
                </Button>
              </div>
            </div>

            <DepositDialog
              isOpen={isDepositDialogOpen}
              onClose={() => setIsDepositDialogOpen(false)}
              walletAddress={wallet?.address || ""}
            />
          </>
        );

      case "complete":
        return (
          <>
            <DialogHeader>
              <DialogTitle>Setup Complete!</DialogTitle>
              <DialogDescription>
                Your game wallet has been successfully set up. You're ready to
                start playing!
              </DialogDescription>
            </DialogHeader>
            <div className="py-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-600 font-semibold">✓</span>
                  </div>
                  <div>
                    <p className="font-medium">Game Wallet Created</p>
                    <p className="text-sm text-muted-foreground">
                      Ready for transactions
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-600 font-semibold">✓</span>
                  </div>
                  <div>
                    <p className="font-medium">Wallet Delegated</p>
                    <p className="text-sm text-muted-foreground">
                      Seamless gameplay enabled
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose} className="w-full">
                Start Playing!
              </Button>
            </DialogFooter>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-[500px]"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {renderStepContent()}
      </DialogContent>
    </Dialog>
  );
}
