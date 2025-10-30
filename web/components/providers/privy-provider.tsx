"use client";

import envConfig from "@/configs/env";
import type { PrivyClientConfig } from "@privy-io/react-auth";
import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";

const privyConfig: PrivyClientConfig = {
  //   embeddedWallets: {
  //     solana: {
  //       createOnLogin: "all-users",
  //     },
  //   },
  loginMethods: ["wallet"],
  appearance: {
    showWalletLoginFirst: true,
    accentColor: "#6A6FF5",
    loginMessage: "Please sign this message to confirm your identity",
    walletChainType: "solana-only",
    theme: "dark",
    walletList: ["phantom", "solflare", "backpack"],
  },
  solanaClusters: [
    {
      name: "devnet",
      rpcUrl: envConfig.NEXT_PUBLIC_DEVNET_RPC_URL,
    },
    {
      name: "mainnet-beta",
      rpcUrl: envConfig.NEXT_PUBLIC_MAINNET_RPC_URL,
    },
  ],
  externalWallets: {
    solana: {
      connectors: toSolanaWalletConnectors(),
    },
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
