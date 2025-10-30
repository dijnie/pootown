import { useRpcContext } from "@/components/providers/rpc-provider";
import { GameStatus } from "@/lib/sdk/generated";
import { sdk } from "@/lib/sdk/sdk";
import { GameAccount } from "@/types/schema";
import useSWR from "swr";

interface UseGamesConfig {
  enabled?: boolean;
  onError?: (error: Error) => void;
  onSuccess?: (data: number) => void;
}

interface UseGamesResult {
  data: GameAccount[] | undefined;
  error: Error | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<GameAccount[] | undefined>;
}

export function useGames(config: UseGamesConfig = {}): UseGamesResult {
  const { enabled = true } = config;
  const { rpc, erRpc } = useRpcContext();

  const cacheKey = enabled ? ["game-list"] : null;

  const { data, error, isLoading, mutate } = useSWR(
    cacheKey,
    async () => {
      const allGames = await Promise.all([
        sdk.getGameAccounts(rpc),
        sdk.getGameAccounts(erRpc),
      ]);

      const map = new Map<string, GameAccount>();

      for (const game of allGames[0]) {
        map.set(game.address, game);
      }

      for (const game of allGames[1]) {
        const existing = map.get(game.address);

        if (!existing) {
          map.set(game.address, game);
        } else if (game.gameStatus === GameStatus.InProgress) {
          map.set(game.address, game);
        }
      }

      console.log(
        "allGames",
        Array.from(map.values()).map((game) => new Date(game.createdAt * 1000))
      );

      return Array.from(map.values()).sort((a, b) => {
        if (a.createdAt > b.createdAt) {
          return -1;
        }
        if (b.createdAt > a.createdAt) {
          return 1;
        }
        return 0;
      });
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      shouldRetryOnError: false,
    }
  );

  const refetch = async (): Promise<GameAccount[] | undefined> => {
    return await mutate();
  };

  console.error(error);

  return {
    data,
    error,
    isLoading,
    isError: !!error,
    refetch,
  };
}
