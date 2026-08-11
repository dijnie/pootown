"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "./ui/checkbox";

interface EntryFeeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (entryFee: number) => void;
  loading?: boolean;
}

type GameType = "free" | "paid";

export function EntryFeeDialog({
  isOpen,
  onClose,
  onConfirm,
  loading,
}: EntryFeeDialogProps) {
  const [entryFee, setEntryFee] = useState("0.1");
  const [isFreeGame, setIsFreeGame] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = () => {
    if (isFreeGame) {
      setError("");
      onConfirm(0);
      return;
    }

    const fee = parseFloat(entryFee);

    if (isNaN(fee) || fee < 0) {
      setError("Please enter a valid amount");
      return;
    }

    if (fee < 0.01) {
      setError("Minimum entry fee is 0.01 SOL");
      return;
    }

    if (fee > 100) {
      setError("Maximum entry fee is 100 SOL");
      return;
    }

    setError("");
    onConfirm(fee);
  };

  const quickAmounts = [0.1, 0.5, 1, 5];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md border-4 border-black shadow-[12px_12px_0_#000] bg-[#fffef0]">
        <DialogHeader>
          <DialogTitle className="text-3xl font-black uppercase text-black [text-shadow:3px_3px_0_#ff0080]">
            🎮 CREATE GAME
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-black uppercase text-black">
                Entry Fee (SOL)
              </Label>
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={isFreeGame}
                  onCheckedChange={(checked) => {
                    setIsFreeGame(checked as boolean);
                  }}
                  id="free"
                />
                <Label htmlFor="free">FREE GAME</Label>
              </div>
            </div>
            <div className="relative">
              <Input
                type="number"
                step="0.1"
                min="0.01"
                max="100"
                value={entryFee}
                disabled={isFreeGame}
                onChange={(e) => {
                  setEntryFee(e.target.value);
                  setError("");
                }}
                className="border-4 border-black shadow-[4px_4px_0_#000] font-bold text-lg pr-16 focus:shadow-[6px_6px_0_#000] transition-all disabled:transition-none"
                placeholder="Enter entry fee"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-black">
                SOL
              </span>
            </div>
            {error && (
              <p className="text-sm font-bold text-[#ff0080]">⚠️ {error}</p>
            )}
          </div>

          {/* Quick Amount Buttons */}
          <div className="space-y-2">
            <Label className="text-sm font-black uppercase text-black">
              Quick Select
            </Label>
            <div className="grid grid-cols-4 gap-2">
              {quickAmounts.map((amount) => (
                <button
                  key={amount}
                  onClick={() => {
                    setEntryFee(amount.toString());
                    setError("");
                  }}
                  disabled={isFreeGame}
                  className={`border-4 border-black disabled:!transition-none shadow-[4px_4px_0_#000] py-2 font-black uppercase text-sm transition-all hover:shadow-[6px_6px_0_#000] hover:-translate-y-1 active:shadow-[2px_2px_0_#000] active:translate-y-0 ${
                    parseFloat(entryFee) === amount
                      ? "bg-[#9945ff] text-white"
                      : "bg-white text-black hover:bg-[#14f195]"
                  }`}
                >
                  {amount} SOL
                </button>
              ))}
            </div>
          </div>

          {/* Info Box */}
          <div
            className={`border-4 border-black shadow-[6px_6px_0_#000] p-4 space-y-2 ${
              isFreeGame ? "bg-[#14f195]" : "bg-[#ffed00]"
            }`}
          >
            <div className="flex items-center justify-between text-sm font-bold">
              <span className="text-black/70">Game Type:</span>
              <span className="text-black">
                {isFreeGame ? "🆓 Free" : "💰 Paid"}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm font-bold">
              <span className="text-black/70">Entry Fee:</span>
              <span className="text-black">
                {isFreeGame ? "0 SOL" : `${entryFee || "0"} SOL`}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm font-bold">
              <span className="text-black/70">Max Players:</span>
              <span className="text-black">4</span>
            </div>
            {/* {!isFreeGame && (
              <div className="border-t-2 border-black pt-2 mt-2">
                <div className="flex items-center justify-between text-base font-black">
                  <span className="text-black">Prize Pool:</span>
                  <span className="text-black">
                    {(parseFloat(entryFee || "0") * 4).toFixed(2)} SOL
                  </span>
                </div>
              </div>
            )} */}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={onClose}
              variant="neutral"
              className="flex-1 border-4 border-black shadow-[6px_6px_0_#000] font-black uppercase hover:shadow-[8px_8px_0_#000] hover:-translate-y-1 transition-all"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              loading={loading}
              className="flex-1 bg-[#9945ff] border-4 border-black shadow-[6px_6px_0_#000] font-black uppercase hover:bg-[#14f195] hover:shadow-[8px_8px_0_#000] hover:-translate-y-1 active:shadow-[4px_4px_0_#000] active:translate-y-0 transition-all"
            >
              {loading ? "Creating..." : "Create Game"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
