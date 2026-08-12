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
  const { address: gameAddress } = useParams<{ address: string }>();
  const { authenticated, openLogin, ready } = useAuth();
  const { sessions } = useApi();
  const room = useRoom();
  const { connect, disconnect, state: roomState, status: roomStatus } = room;
  const { setGameAddress, gameState, gameLoading, gameError } =
    useGameContext();
  const [reconnectError, setReconnectError] = useState<Error | null>(null);
  const reconnectKey = useRef(crypto.randomUUID());

  // Board rotation state lifted here
  const [boardRotation, setBoardRotation] = useState<number>(0);

  const handleRotateClockwise = () => {
    setBoardRotation((prev) => (prev + 90) % 360);
  };

  const handleRotateCounterClockwise = () => {
    setBoardRotation((prev) => (prev - 90 + 360) % 360);
  };

  useEffect(() => {
    if (gameAddress) {
      setGameAddress(gameAddress);
    }
  }, [gameAddress, setGameAddress]);

  useEffect(() => {
    const parsedGameId = GameIdSchema.safeParse(gameAddress);
    if (!parsedGameId.success || !ready || !authenticated || roomStatus === "connecting") return;
    if (roomState?.gameId === parsedGameId.data) return;
    let active = true;
    void sessions.reconnect(parsedGameId.data, { idempotencyKey: reconnectKey.current })
      .then((admission) => connect(admission))
      .then(() => active && setReconnectError(null))
      .catch((error: unknown) => {
        if (active) setReconnectError(error instanceof Error ? error : new Error("Unable to reconnect"));
      });
    return () => {
      active = false;
    };
  }, [authenticated, connect, gameAddress, ready, roomState?.gameId, roomStatus, sessions]);

  useEffect(() => () => {
    void disconnect();
  }, [disconnect]);

  const parsedGameId = GameIdSchema.safeParse(gameAddress);

  if (!parsedGameId.success) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <p>Invalid game link.</p>
      </div>
    );
  }

  if (!ready || (authenticated && (gameLoading || !gameState))) {
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

  if (gameError || reconnectError) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <div id="error">
          <p>ERROR: {(gameError ?? reconnectError)?.message}</p>
        </div>
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
