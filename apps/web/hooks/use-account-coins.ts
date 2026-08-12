"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CoinBalanceResponse, UserView } from "@pootown/game-contracts";

import { useApi } from "@/components/providers/api-provider";
import { useAuth } from "@/components/providers/auth-provider";

type AccountCoinState = {
  readonly balance: CoinBalanceResponse | null;
  readonly error: Error | null;
  readonly loading: boolean;
  readonly refresh: () => Promise<void>;
  readonly user: UserView | null;
};

export function useAccountCoins(): AccountCoinState {
  const { authenticated, ready } = useAuth();
  const { accounts } = useApi();
  const generation = useRef(0);
  const [balance, setBalance] = useState<CoinBalanceResponse | null>(null);
  const [user, setUser] = useState<UserView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!ready || !authenticated) return;
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const [nextUser, nextBalance] = await Promise.all([accounts.me(), accounts.balance()]);
      if (current !== generation.current) return;
      setUser(nextUser);
      setBalance(nextBalance);
    } catch (cause) {
      if (current !== generation.current) return;
      setError(cause instanceof Error ? cause : new Error("Unable to load account coin"));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [accounts, authenticated, ready]);

  useEffect(() => {
    if (!ready || !authenticated) {
      generation.current += 1;
      setBalance(null);
      setUser(null);
      setError(null);
      setLoading(false);
      return;
    }
    void refresh();
    return () => {
      generation.current += 1;
    };
  }, [authenticated, ready, refresh]);

  return { balance, error, loading, refresh, user };
}
