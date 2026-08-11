"use client";

import { useRpcContext } from "@/components/providers/rpc-provider";
import { address } from "@solana/kit";
import useSWR from "swr";

export function useSolBalance(walletAddress?: string) {
  const { rpc } = useRpcContext();

  const { data, error, isLoading, mutate } = useSWR(
    walletAddress ? `sol-balance-${walletAddress}` : null,
    async () => {
      if (!walletAddress) return null;

      try {
        const { value } = await rpc.getBalance(address(walletAddress)).send();
        return value; 
      } catch (error) {
        console.error("Failed to fetch SOL balance:", error);
        throw error;
      }
    },
    {
      refreshInterval: 10000, 
      revalidateOnFocus: true,
    }
  );

  const balanceInSol = data ? Number(data) / 1_000_000_000 : 0; 

  return {
    balance: data,
    balanceInSol,
    isLoading,
    error,
    refetch: mutate,
  };
}
