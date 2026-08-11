"use client";

import { useState } from "react";
import type { GameDefinitionId, GameDefinitionView } from "@pootown/game-contracts";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface GameDefinitionDialogProps {
  readonly definitions: readonly GameDefinitionView[];
  readonly isOpen: boolean;
  readonly loading?: boolean;
  readonly onClose: () => void;
  readonly onConfirm: (gameDefinitionId: GameDefinitionId) => void;
}

function formatCoin(value: string): string {
  return new Intl.NumberFormat("en-US").format(BigInt(value));
}

export function GameDefinitionDialog({
  definitions,
  isOpen,
  loading = false,
  onClose,
  onConfirm,
}: GameDefinitionDialogProps) {
  const [selectedId, setSelectedId] = useState<GameDefinitionId | null>(null);
  const effectiveSelectedId = definitions.some((definition) => definition.gameDefinitionId === selectedId)
    ? selectedId
    : definitions[0]?.gameDefinitionId ?? null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg border-4 border-black shadow-[12px_12px_0_#000] bg-[#fffef0]">
        <DialogHeader>
          <DialogTitle className="text-3xl font-black uppercase text-black [text-shadow:3px_3px_0_#ff0080]">
            Choose game rules
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-4">
          {definitions.map((definition) => {
            const selected = definition.gameDefinitionId === effectiveSelectedId;
            return (
              <button
                type="button"
                key={definition.gameDefinitionId}
                disabled={loading}
                onClick={() => setSelectedId(definition.gameDefinitionId)}
                className={`w-full border-4 border-black p-4 text-left shadow-[4px_4px_0_#000] ${selected ? "bg-[#14f195]" : "bg-white"}`}
              >
                <span className="block text-lg font-black text-black">{definition.displayName}</span>
                <span className="block text-sm font-bold text-black/70">
                  {definition.entryCoin === "0" ? "Free" : `${formatCoin(definition.entryCoin)} account coin`}
                  {` · Up to ${definition.maximumPlayers} players`}
                </span>
              </button>
            );
          })}
          {definitions.length === 0 && (
            <p className="py-6 text-center font-bold text-black/70">
              No game rules are currently available.
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="neutral" className="flex-1" disabled={loading} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={effectiveSelectedId === null}
            loading={loading}
            onClick={() => effectiveSelectedId !== null && onConfirm(effectiveSelectedId)}
          >
            Create game
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
