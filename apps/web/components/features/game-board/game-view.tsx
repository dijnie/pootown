"use client";

import { useEffect, useRef, useState } from "react";
import GameBoard from "./game-board";

import { useGameContext } from "@/components/providers/game-provider";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { LeftPanel } from "./left-panel";
import { RightPanel } from "./right-panel";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { useApi } from "@/components/providers/api-provider";
import { useRoom } from "@/components/providers/room-provider";
import { GameIdSchema } from "@pootown/game-contracts";

export function GameView() {
  const { address: gameId } = useParams<{ address: string }>();
  const { authenticated, openLogin, ready } = useAuth();
  const { sessions } = useApi();
  const room = useRoom();
  const { disconnect, reconnect, state: roomState } = room;
  const { setGameId, gameState, gameLoading, gameError } = useGameContext();
  const [reconnectError, setReconnectError] = useState<Error | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const reconnectRequest = useRef<{
    gameId: string | null;
    idempotencyKey: string;
  }>({
    gameId: null,
    idempotencyKey: crypto.randomUUID(),
  });

  // Board rotation state lifted here
  const [boardRotation, setBoardRotation] = useState<number>(0);

  const handleRotateClockwise = () => {
    setBoardRotation((prev) => (prev + 90) % 360);
  };

  const handleRotateCounterClockwise = () => {
    setBoardRotation((prev) => (prev - 90 + 360) % 360);
  };

  useEffect(() => {
    if (gameId) {
      setGameId(gameId);
    }
  }, [gameId, setGameId]);

  useEffect(() => {
    const parsedGameId = GameIdSchema.safeParse(gameId);
    if (
      !parsedGameId.success ||
      !ready ||
      !authenticated
    )
      return;
    if (roomState?.gameId === parsedGameId.data) {
      setReconnectError(null);
      setReconnecting(false);
      return;
    }
    if (reconnectRequest.current.gameId !== parsedGameId.data) {
      reconnectRequest.current = {
        gameId: parsedGameId.data,
        idempotencyKey: crypto.randomUUID(),
      };
    }
    let active = true;
    setReconnectError(null);
    setReconnecting(true);
    void sessions
      .reconnect(parsedGameId.data, {
        idempotencyKey: reconnectRequest.current.idempotencyKey,
      })
      .then((admission) => reconnect(admission))
      .then(() => active && setReconnectError(null))
      .catch(() => {
        if (active) {
          setReconnectError(new Error("Unable to reconnect to this game."));
        }
      })
      .finally(() => {
        if (active) setReconnecting(false);
      });
    return () => {
      active = false;
    };
  }, [
    authenticated,
    gameId,
    ready,
    reconnectAttempt,
    reconnect,
    roomState?.gameId,
    sessions,
  ]);

  useEffect(
    () => () => {
      void disconnect();
    },
    [disconnect]
  );

  const parsedGameId = GameIdSchema.safeParse(gameId);

  if (!parsedGameId.success) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p>Invalid game link.</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Spinner variant="bars" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Button onClick={openLogin}>Sign in to reconnect</Button>
      </div>
    );
  }

  if (reconnecting) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Spinner variant="bars" />
      </div>
    );
  }

  if (gameError || reconnectError) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <div
          id="error"
          className="flex max-w-md flex-col items-center gap-4 text-center"
        >
          <p>ERROR: {(gameError ?? reconnectError)?.message}</p>
          <Button onClick={() => setReconnectAttempt((attempt) => attempt + 1)}>
            Try reconnecting
          </Button>
        </div>
      </div>
    );
  }

  if (gameLoading || !gameState) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Spinner variant="bars" />
      </div>
    );
  }

  return (
    <div className="max-h-screen xl:h-screen game-container w-full h-full relative">
      <div
        style={{
          gridArea: "left",
        }}
        className="overflow-hidden h-full relative z-10"
      >
        <LeftPanel
          onRotateCW={handleRotateClockwise}
          onRotateCCW={handleRotateCounterClockwise}
          boardRotation={boardRotation}
        />
      </div>
      <div
        style={{
          gridArea: "center",
        }}
        className="aspect-square w-screen lg:w-auto lg:h-[80vh] xl:h-screen"
      >
        <GameBoard boardRotation={boardRotation} />
      </div>
      <div
        style={{
          gridArea: "right",
        }}
        className="relative z-10"
      >
        <RightPanel />
      </div>
    </div>
  );
}
