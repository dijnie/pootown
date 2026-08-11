"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { useGameContext } from "@/components/providers/game-provider";
import { useState } from "react";
import { toast } from "sonner";
import { GameStatus } from "@/lib/sdk/generated";

export function BankruptcyButton() {
  const { declareBankruptcy, gameState, currentPlayerState, isCurrentTurn } =
    useGameContext();
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleDeclareBankruptcy = async () => {
    try {
      setIsLoading(true);
      await declareBankruptcy();
      toast.success("Bankruptcy declared successfully");
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Failed to declare bankruptcy:", error);
      toast.error("Failed to declare bankruptcy");
    } finally {
      setIsLoading(false);
    }
  };

  // Only show the button if it's the current player's turn and they're not already bankrupt
  if (
    !currentPlayerState ||
    currentPlayerState.isBankrupt ||
    gameState?.gameStatus !== GameStatus.InProgress
  ) {
    return null;
  }

  return (
    <div className="w-full">
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button
            // variant="neutral"
            size="default"
            // className="w-full bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
            className="w-full"
          >
            <AlertTriangle className="w-4 h-4 mr-2" />
            Declare Bankruptcy
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Declare Bankruptcy
            </DialogTitle>
            <DialogDescription className="text-left">
              Are you sure you want to declare bankruptcy? This action cannot be
              undone and will:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Remove you from the game permanently</li>
                <li>Transfer all your properties to the bank</li>
                <li>End your participation in this game</li>
              </ul>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="neutral"
              onClick={() => setIsDialogOpen(false)}
              disabled={isLoading}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleDeclareBankruptcy}
              loading={isLoading}
            >
              Confirm Bankruptcy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
