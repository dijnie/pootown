import { GameProvider } from "@/components/providers/game-provider";
import { RpcProvider } from "@/components/providers/rpc-provider";
import { PrivyWalletProvider } from "./privy-provider";
// import { CreateGameWalletDialog } from "../create-game-wallet-dialog";
import { GameEventsProvider } from "./game-events-provider";
import { GameLogsProvider } from "./game-logs-provider";
import { ApiProvider } from "./api-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <RpcProvider>
      <PrivyWalletProvider>
        <ApiProvider>
          <GameProvider>
            <GameEventsProvider>
              <GameLogsProvider>
                {children}
                {/* <CreateGameWalletDialog /> */}
              </GameLogsProvider>
            </GameEventsProvider>
          </GameProvider>
        </ApiProvider>
      </PrivyWalletProvider>
    </RpcProvider>
  );
}
