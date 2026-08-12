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
  ServerMessage,
} from "@pootown/game-contracts";

import envConfig from "@/configs/env";
import {
  GameRoomClient,
  createColyseusRoomConnector,
  type RoomPublicState,
} from "@/services/game-room-client";
import { RoomOperationFence } from "@/services/room-operation-fence";
import { openRoomConnection } from "@/services/room-connection";

type RoomConnectionStatus = "disconnected" | "connecting" | "connected";

type RoomContextValue = {
  readonly connect: (admission: AdmissionResponse) => Promise<RoomPublicState>;
  readonly reconnect: (
    admission: AdmissionResponse
  ) => Promise<RoomPublicState>;
  readonly disconnect: () => Promise<void>;
  readonly error: Error | null;
  readonly lastMessage: ServerMessage | null;
  readonly messages: readonly ServerMessage[];
  readonly playerId: AdmissionResponse["admission"]["playerId"] | null;
  readonly send: (command: RoomCommand) => Promise<CommandAcknowledgement>;
  readonly state: RoomPublicState | null;
  readonly status: RoomConnectionStatus;
};

const RoomContext = createContext<RoomContextValue | null>(null);

export function RoomProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<RoomPublicState | null>(null);
  const [status, setStatus] = useState<RoomConnectionStatus>("disconnected");
  const [error, setError] = useState<Error | null>(null);
  const [lastMessage, setLastMessage] = useState<ServerMessage | null>(null);
  const [messages, setMessages] = useState<ServerMessage[]>([]);
  const [playerId, setPlayerId] = useState<
    AdmissionResponse["admission"]["playerId"] | null
  >(null);
  const operations = useRef(new RoomOperationFence());
  const client = useMemo(
    () =>
      new GameRoomClient(
        createColyseusRoomConnector(envConfig.NEXT_PUBLIC_GAME_SERVER_URL),
        {
          onProtocolError: () => {
            setState(null);
            setPlayerId(null);
            setLastMessage(null);
            setMessages([]);
            setStatus("disconnected");
            setError(new Error("The game server returned invalid data"));
          },
          onMessage: (message) => {
            setLastMessage(message);
            setMessages((current) => [...current, message].slice(-100));
          },
          onState: setState,
          onTransportError: () =>
            setError(new Error("The game server connection failed")),
          onUnexpectedDisconnect: () => {
            setState(null);
            setPlayerId(null);
            setLastMessage(null);
            setMessages([]);
            setStatus("disconnected");
            setError(new Error("The game server disconnected"));
          },
        }
      ),
    []
  );

  useEffect(
    () => () => {
      operations.current.invalidate();
      void client.disconnect();
    },
    [client]
  );

  const disconnect = useCallback(async () => {
    const operation = operations.current.start();
    try {
      await client.disconnect();
    } finally {
      if (operations.current.isCurrent(operation)) {
        setState(null);
        setPlayerId(null);
        setLastMessage(null);
        setMessages([]);
        setStatus("disconnected");
      }
    }
  }, [client]);

  const openConnection = useCallback(
    async (admission: AdmissionResponse, replaceExisting: boolean) => {
      const operation = operations.current.start();
      try {
        if (replaceExisting && !operations.current.isCurrent(operation)) {
          throw new Error("Room connection was superseded");
        }
        setError(null);
        setLastMessage(null);
        setMessages([]);
        setPlayerId(admission.admission.playerId);
        setStatus("connecting");
        const nextState = await openRoomConnection(
          client,
          admission,
          replaceExisting
        );
        if (!operations.current.isCurrent(operation)) {
          throw new Error("Room connection was superseded");
        }
        setState(nextState);
        setStatus("connected");
        return nextState;
      } catch (connectionError) {
        const normalized =
          connectionError instanceof Error
            ? connectionError
            : new Error("The game server connection failed");
        if (operations.current.isCurrent(operation)) {
          setState(null);
          setPlayerId(null);
          setLastMessage(null);
          setMessages([]);
          setError(normalized);
          setStatus("disconnected");
        }
        throw normalized;
      }
    },
    [client]
  );

  const connect = useCallback(
    (admission: AdmissionResponse) => openConnection(admission, true),
    [openConnection]
  );
  const reconnect = useCallback(
    (admission: AdmissionResponse) => openConnection(admission, false),
    [openConnection]
  );

  const value = useMemo<RoomContextValue>(
    () => ({
      connect,
      disconnect,
      error,
      lastMessage,
      messages,
      playerId,
      reconnect,
      send: (command) => client.send(command),
      state,
      status,
    }),
    [
      client,
      connect,
      disconnect,
      error,
      lastMessage,
      messages,
      playerId,
      reconnect,
      state,
      status,
    ]
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomContextValue {
  const value = useContext(RoomContext);
  if (value === null)
    throw new Error("useRoom must be used within RoomProvider");
  return value;
}
