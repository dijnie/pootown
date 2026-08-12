"use client";

import { useMemo, useState } from "react";
import type {
  AdmissionResponse,
  GameDefinitionId,
  SessionView,
} from "@pootown/game-contracts";
import { ChevronDown, Filter, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { GameDefinitionDialog } from "@/components/game-definition-dialog";
import { useAuth } from "@/components/providers/auth-provider";
import { useApi } from "@/components/providers/api-provider";
import { useRoom } from "@/components/providers/room-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGameDefinitions } from "@/hooks/use-game-definitions";
import { useGames } from "@/hooks/useGames";
import { ApiError } from "@/services/api-client";

import { GameItem } from "./game-item";
import { GameListLoading } from "./game-list-loading";

type GameStatusFilter = "all" | SessionView["lifecycle"];

const FILTER_OPTIONS: ReadonlyArray<{ readonly value: GameStatusFilter; readonly label: string }> = [
  { value: "all", label: "All Games" },
  { value: "open", label: "Waiting for Players" },
  { value: "active", label: "In Progress" },
  { value: "settled", label: "Finished" },
];

function requestId(): string {
  return crypto.randomUUID();
}

export function GameList() {
  const router = useRouter();
  const { authenticated, openLogin } = useAuth();
  const { sessions } = useApi();
  const { connect } = useRoom();
  const [statusFilter, setStatusFilter] = useState<GameStatusFilter>("all");
  const [joiningGameId, setJoiningGameId] = useState<string | null>(null);
  const { data: games, isError, isLoading, refetch } = useGames();

  const filteredGames = useMemo(() => {
    if (statusFilter === "all") return games;
    return games?.filter((game) => game.lifecycle === statusFilter);
  }, [games, statusFilter]);

  const enterRoom = async (admission: AdmissionResponse) => {
    await connect(admission);
    router.push(`/game/${admission.session.gameId}`);
  };

  const handleJoinGame = async (game: SessionView) => {
    if (!authenticated) {
      openLogin();
      return;
    }
    setJoiningGameId(game.gameId);
    try {
      let admission: AdmissionResponse;
      try {
        admission = await sessions.join(game.gameId, { idempotencyKey: requestId() });
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== "ALREADY_SEATED") throw error;
        admission = await sessions.reconnect(game.gameId, { idempotencyKey: requestId() });
      }
      await enterRoom(admission);
      toast.success("Game joined successfully");
    } catch {
      toast.error("Unable to join this game. Please try again.");
    } finally {
      setJoiningGameId(null);
    }
  };

  const filterLabel = FILTER_OPTIONS.find((option) => option.value === statusFilter)?.label ?? "All Games";

  return (
    <div className="w-full">
      <div className="mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <h1 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">All Games</h1>
            <p className="text-sm text-muted-foreground sm:text-base">Join a waiting game or create a new one.</p>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <CreateGameButton />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="neutral" className="w-full gap-2 sm:w-auto">
                  <Filter className="h-4 w-4" />
                  <span className="hidden xs:inline">{filterLabel}</span>
                  <span className="xs:hidden">Filter</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {FILTER_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => setStatusFilter(option.value)}
                    className={statusFilter === option.value ? "bg-secondary-background" : ""}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {isLoading ? (
        <GameListLoading />
      ) : isError ? (
        <div className="px-4 py-10 text-center">
          <p className="mb-4 text-muted-foreground">Games are temporarily unavailable.</p>
          <Button variant="neutral" onClick={() => void refetch()}>Try again</Button>
        </div>
      ) : !filteredGames?.length ? (
        <div className="px-4 py-8 text-center sm:py-12">
          <div className="text-base text-gray-500 sm:text-lg">No games available</div>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-400 sm:text-base">
            {statusFilter === "all" ? "Be the first to create a game!" : "Try another filter or create a new game."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:gap-6">
          {filteredGames.map((game) => (
            <GameItem
              key={game.gameId}
              game={game}
              onJoinGame={handleJoinGame}
              joining={joiningGameId !== null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CreateGameButton() {
  const router = useRouter();
  const { authenticated, openLogin } = useAuth();
  const { sessions } = useApi();
  const { connect } = useRoom();
  const definitions = useGameDefinitions();
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const openDialog = () => {
    if (!authenticated) {
      openLogin();
      return;
    }
    if (definitions.error !== undefined) {
      toast.error("Game rules are temporarily unavailable.");
      return;
    }
    if (!definitions.data?.length) {
      toast.error("No game rules are currently available.");
      return;
    }
    setDialogOpen(true);
  };

  const createGame = async (gameDefinitionId: GameDefinitionId) => {
    setLoading(true);
    try {
      const admission = await sessions.create(gameDefinitionId, { idempotencyKey: requestId() });
      await connect(admission);
      setDialogOpen(false);
      toast.success("Game created successfully");
      router.push(`/game/${admission.session.gameId}`);
    } catch {
      toast.error("Unable to create a game. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={openDialog}
        className="w-full gap-2 sm:w-auto"
        disabled={authenticated && definitions.isLoading}
      >
        <Plus className="h-4 w-4" />
        <span className="hidden xs:inline">Create Game</span>
        <span className="xs:hidden">Create</span>
      </Button>
      <GameDefinitionDialog
        definitions={definitions.data ?? []}
        isOpen={dialogOpen}
        loading={loading}
        onClose={() => setDialogOpen(false)}
        onConfirm={createGame}
      />
    </>
  );
}
