import { GameProvider } from "@/components/providers/game-provider";
import { AuthProvider } from "./auth-provider";
import { GameEventsProvider } from "./game-events-provider";
import { GameLogsProvider } from "./game-logs-provider";
import { ApiProvider } from "./api-provider";
import { RoomProvider } from "./room-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
      <AuthProvider>
        <ApiProvider>
          <RoomProvider>
            <GameProvider>
              <GameEventsProvider>
                <GameLogsProvider>
                  {children}
                </GameLogsProvider>
              </GameEventsProvider>
            </GameProvider>
          </RoomProvider>
        </ApiProvider>
      </AuthProvider>
  );
}
