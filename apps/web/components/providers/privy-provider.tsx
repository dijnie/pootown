"use client";

import envConfig from "@/configs/env";
import type { PrivyClientConfig } from "@privy-io/react-auth";
import { PrivyProvider } from "@privy-io/react-auth";

const privyConfig: PrivyClientConfig = {
  loginMethods: ["email", "google"],
  appearance: {
    accentColor: "#6A6FF5",
    loginMessage: "Sign in to play Poo Town",
    theme: "dark",
  },
};

export function PrivyWalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PrivyProvider
      appId={envConfig.NEXT_PUBLIC_PRIVY_APP_ID}
      config={privyConfig}
    >
      {children}
    </PrivyProvider>
  );
}
