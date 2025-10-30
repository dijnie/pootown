"use client";

import { useState, useMemo } from "react";
import { ChevronDown, Filter, Plus } from "lucide-react";
import { GameListLoading } from "./game-list-loading";
import { GameItem } from "./game-item";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { sdk } from "@/lib/sdk/sdk";
import { useWallet } from "@/hooks/use-wallet";
import { toast } from "sonner";
import { useRpcContext } from "@/components/providers/rpc-provider";
import { PLATFORM_ID } from "@/configs/constants";
import { buildAndSendTransactionWithPrivy } from "@/lib/tx";
import { address, TransactionSigner } from "@solana/kit";
import { useGames } from "@/hooks/useGames";
import { GameEndReason, GameStatus } from "@/lib/sdk/generated";
import { EntryFeeDialog } from "@/components/entry-fee-dialog";
import { CreateGameWalletDialog } from "@/components/create-game-wallet-dialog";
import { useGameWalletCheck } from "@/hooks/use-game-wallet-check";
import { GameAccount } from "@/types/schema";
import { showGameEndedToast } from "@/lib/toast-utils";

type GameStatusFilter = "all" | GameStatus;

const FILTER_OPTIONS = [
  { value: "all" as const, label: "All Games" },
  { value: GameStatus.WaitingForPlayers, label: "Waiting for Players" },
  { value: GameStatus.InProgress, label: "In Progress" },
  { value: GameStatus.Finished, label: "Finished" },
];

export function GameList() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<GameStatusFilter>(0);
  const { wallet, authenticated } = useWallet();
  const { rpc } = useRpcContext();
  const [joining, setJoining] = useState(false);
  const [showCreateWalletDialog, setShowCreateWalletDialog] = useState(false);
  const { checkGameWallet } = useGameWalletCheck();

  const { data: games, isLoading } = useGames();

  const filteredGames = useMemo(() => {
    if (statusFilter === "all") {
      return games;
    }
    return (games || []).filter((game) => game.gameStatus === statusFilter);
  }, [games, statusFilter]);

  const handleJoinGame = async (game: GameAccount) => {
    if (!checkGameWallet(() => setShowCreateWalletDialog(true))) {
      return;
    }

    setJoining(true);

    const gameAddress = game.address.toString();

    try {
      if (!wallet) {
        toast.error("Wallet not found");
        return;
      }

      if (
        game.players
          .map((address) => address.toString())
          .includes(wallet.address.toString())
      ) {
        router.push(`/game/${gameAddress}`);
        return;
      }

      const { instructions } = await sdk.joinGameIx({
        rpc,
        player: { address: address(wallet.address) } as TransactionSigner,
        gameAddress: address(gameAddress),
      });

      const signature = await buildAndSendTransactionWithPrivy(
        rpc,
        instructions,
        wallet
      );

      if (!signature) {
        toast.error("Failed to join game. Please try again.");
        return;
      }

      toast.success("Game joined successfully!");
      router.push(`/game/${gameAddress}`);
    } catch (error) {
      console.error("Failed to join game:", error);
      toast.error("Failed to join game. Please try again.");
    } finally {
      setJoining(false);
    }
  };

  const handleSpectateGame = (gameAddress: string) => {
    router.push(`/game/${gameAddress}`);
  };

  const getFilterLabel = () => {
    const option = FILTER_OPTIONS.find((opt) => opt.value === statusFilter);
    return option?.label || "All Games";
  };

  if (isLoading) {
    return (
      <div className="w-full">
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
                All Games
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                Join a game or spectate ongoing matches
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <CreateGameButton />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="neutral" className="gap-2 w-full sm:w-auto">
                    <Filter className="w-4 h-4" />
                    <span className="hidden xs:inline">{getFilterLabel()}</span>
                    <span className="xs:hidden">Filter</span>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {FILTER_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => setStatusFilter(option.value)}
                      className={
                        statusFilter === option.value
                          ? "bg-secondary-background"
                          : ""
                      }
                    >
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        <GameListLoading />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
              All Games
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Join a game or spectate ongoing matches
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <CreateGameButton />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="neutral" className="gap-2 w-full sm:w-auto">
                  <Filter className="w-4 h-4" />
                  <span className="hidden xs:inline">{getFilterLabel()}</span>
                  <span className="xs:hidden">Filter</span>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {FILTER_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => setStatusFilter(option.value)}
                    className={
                      statusFilter === option.value
                        ? "bg-secondary-background"
                        : ""
                    }
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {!filteredGames || filteredGames.length === 0 ? (
        <div className="text-center py-8 sm:py-12 px-4">
          <div className="text-gray-500 text-base sm:text-lg">
            No games available
          </div>
          <p className="text-gray-400 mt-2 text-sm sm:text-base max-w-md mx-auto">
            {statusFilter === "all"
              ? "Be the first to create a game!"
              : "Try selecting a different filter or create a new game!"}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:gap-6">
          {filteredGames.map((game) => (
            <GameItem
              key={game.address}
              game={game}
              onJoinGame={handleJoinGame}
              onSpectateGame={handleSpectateGame}
              joining={joining}
              isWalletConnected={authenticated}
            />
          ))}
        </div>
      )}

      {showCreateWalletDialog && (
        <CreateGameWalletDialog
          isOpen={showCreateWalletDialog}
          onClose={() => setShowCreateWalletDialog(false)}
        />
      )}
    </div>
  );
}

function CreateGameButton() {
  const { wallet } = useWallet();
  const { rpc } = useRpcContext();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showEntryFeeDialog, setShowEntryFeeDialog] = useState(false);
  const [showCreateWalletDialog, setShowCreateWalletDialog] = useState(false);
  const { checkGameWallet } = useGameWalletCheck();

  const handleOpenDialog = () => {
    if (!checkGameWallet(() => setShowCreateWalletDialog(true))) {
      return;
    }
    setShowEntryFeeDialog(true);
  };

  const handleCreateGame = async (entryFee: number) => {
    if (!wallet) {
      toast.error("Please connect your wallet first.");
      return;
    }

    setLoading(true);

    try {
      const { instructions, gameAccountAddress } = await sdk.createGameIx({
        rpc,
        creator: { address: address(wallet.address) } as TransactionSigner,
        platformId: PLATFORM_ID,
        entryFee,
      });

      const signature = await buildAndSendTransactionWithPrivy(
        rpc,
        instructions,
        wallet
      );

      if (!signature) {
        toast.error("Failed to create game. Please try again.");
        setLoading(false);
        return;
      }

      toast.success(`Game created successfully`);
      setShowEntryFeeDialog(false);
      router.push(`/game/${gameAccountAddress}`);
    } catch (error) {
      console.error("Failed to create game:", error);
      toast.error("Failed to create game. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button onClick={handleOpenDialog} className="gap-2 w-full sm:w-auto">
        <Plus className="w-4 h-4" />
        <span className="hidden xs:inline">Create Game</span>
        <span className="xs:hidden">Create</span>
      </Button>

      <EntryFeeDialog
        isOpen={showEntryFeeDialog}
        onClose={() => setShowEntryFeeDialog(false)}
        onConfirm={handleCreateGame}
        loading={loading}
      />

      {showCreateWalletDialog && (
        <CreateGameWalletDialog
          isOpen={showCreateWalletDialog}
          onClose={() => setShowCreateWalletDialog(false)}
        />
      )}
    </>
  );
}
