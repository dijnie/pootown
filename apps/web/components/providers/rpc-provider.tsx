"use client";

import envConfig from "@/configs/env";
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  Rpc,
  RpcSubscriptions,
  SolanaRpcApi,
  SolanaRpcSubscriptionsApi,
} from "@solana/kit";
import { createContext, ReactNode, useContext } from "react";

type Props = Readonly<{
  children: ReactNode;
}>;

interface RpcContextType {
  rpc: Rpc<SolanaRpcApi>;
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  erRpc: Rpc<SolanaRpcApi>;
  erRpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
}

export const RpcContext = createContext<RpcContextType | undefined>(undefined);

export const useRpcContext = () => {
  const context = useContext(RpcContext);
  if (context === undefined) {
    throw new Error("useRpcContext must be used within a RpcProvider");
  }
  return context;
};

export function RpcProvider({ children }: Props) {
  return (
    <RpcContext.Provider
      value={{
        rpc: createSolanaRpc(envConfig.NEXT_PUBLIC_RPC_URL),
        rpcSubscriptions: createSolanaRpcSubscriptions(
          envConfig.NEXT_PUBLIC_RPC_SUBSCRIPTIONS_URL
        ),
        erRpc: createSolanaRpc(envConfig.NEXT_PUBLIC_ER_RPC_URL),
        erRpcSubscriptions: createSolanaRpcSubscriptions(
          envConfig.NEXT_PUBLIC_ER_RPC_SUBSCRIPTIONS_URL
        ),
      }}
    >
      {children}
    </RpcContext.Provider>
  );
}
