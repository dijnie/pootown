"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AdmissionResponse,
  CommandAcknowledgement,
  RoomCommand,
} from "@pootown/game-contracts";

import envConfig from "@/configs/env";
import {
  GameRoomClient,
  createColyseusRoomConnector,
  type RoomPublicState,
} from "@/services/game-room-client";
import { RoomOperationFence } from "@/services/room-operation-fence";

type RoomConnectionStatus = "disconnected" | "connecting" | "connected";

type RoomContextValue = {
  readonly connect: (admission: AdmissionResponse) => Promise<RoomPublicState>;
  readonly disconnect: () => Promise<void>;
  readonly error: Error | null;
  readonly send: (command: RoomCommand) => Promise<CommandAcknowledgement>;
  readonly state: RoomPublicState | null;
  readonly status: RoomConnectionStatus;
};

const RoomContext = createContext<RoomContextValue | null>(null);

export function RoomProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<RoomPublicState | null>(null);
  const [status, setStatus] = useState<RoomConnectionStatus>("disconnected");
  const [error, setError] = useState<Error | null>(null);
  const operations = useRef(new RoomOperationFence());
  const client = useMemo(() => new GameRoomClient(
    createColyseusRoomConnector(envConfig.NEXT_PUBLIC_GAME_SERVER_URL),
    {
      onProtocolError: () => {
        setState(null);
        setStatus("disconnected");
        setError(new Error("The game server returned invalid data"));
      },
      onState: setState,
      onTransportError: () => setError(new Error("The game server connection failed")),
      onUnexpectedDisconnect: () => {
        setState(null);
        setStatus("disconnected");
        setError(new Error("The game server disconnected"));
      },
    },
  ), []);

  useEffect(() => () => {
    operations.current.invalidate();
    void client.disconnect();
  }, [client]);

  const disconnect = useCallback(async () => {
    const operation = operations.current.start();
    try {
      await client.disconnect();
    } finally {
      if (operations.current.isCurrent(operation)) {
        setState(null);
        setStatus("disconnected");
      }
    }
  }, [client]);

  const connect = useCallback(async (admission: AdmissionResponse) => {
    const operation = operations.current.start();
    try {
      await client.disconnect();
      if (!operations.current.isCurrent(operation)) {
        throw new Error("Room connection was superseded");
      }
      setError(null);
      setStatus("connecting");
      const nextState = await client.connect({
        contractVersion: admission.contractVersion,
        gameId: admission.session.gameId,
        ticket: admission.admission.ticket,
      });
      if (!operations.current.isCurrent(operation)) {
        throw new Error("Room connection was superseded");
      }
      setState(nextState);
      setStatus("connected");
      return nextState;
    } catch (connectionError) {
      const normalized = connectionError instanceof Error
        ? connectionError
        : new Error("The game server connection failed");
      if (operations.current.isCurrent(operation)) {
        setState(null);
        setError(normalized);
        setStatus("disconnected");
      }
      throw normalized;
    }
  }, [client]);

  const value = useMemo<RoomContextValue>(() => ({
    connect,
    disconnect,
    error,
    send: (command) => client.send(command),
    state,
    status,
  }), [client, connect, disconnect, error, state, status]);

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomContextValue {
  const value = useContext(RoomContext);
  if (value === null) throw new Error("useRoom must be used within RoomProvider");
  return value;
}
