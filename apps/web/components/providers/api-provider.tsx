"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { usePrivy } from "@privy-io/react-auth";

import envConfig from "@/configs/env";
import { createApiClient, type ApiClient } from "@/services/api-client";
import { createSessionApi } from "@/services/session-api";
import { createAccountApi } from "@/services/account-api";

type ApiContextValue = {
  readonly client: ApiClient;
  readonly accounts: ReturnType<typeof createAccountApi>;
  readonly sessions: ReturnType<typeof createSessionApi>;
};

const ApiContext = createContext<ApiContextValue | null>(null);

export function ApiProvider({ children }: { readonly children: ReactNode }) {
  const { getAccessToken } = usePrivy();
  const value = useMemo<ApiContextValue>(() => {
    const client = createApiClient({
      baseUrl: envConfig.NEXT_PUBLIC_API_URL,
      getAccessToken,
    });
    return {
      client,
      accounts: createAccountApi(client),
      sessions: createSessionApi(client),
    };
  }, [getAccessToken]);

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiContextValue {
  const value = useContext(ApiContext);
  if (value === null) throw new Error("useApi must be used within ApiProvider");
  return value;
}
