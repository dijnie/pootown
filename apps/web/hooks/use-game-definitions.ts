"use client";

import useSWR from "swr";

import { useApi } from "@/components/providers/api-provider";

export function useGameDefinitions() {
  const { sessions } = useApi();
  return useSWR(
    "game-definitions",
    async () => (await sessions.definitions()).items,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      shouldRetryOnError: false,
    },
  );
}
