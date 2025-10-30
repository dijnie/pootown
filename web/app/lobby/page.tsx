import { GameList } from "@/components/features/game-list/game-list";
import { PageLayout } from "@/components/layout/page-layout";

export default function LobbyPage() {
  return (
    <PageLayout>
      <div className="min-h-screen flex flex-col gap-6 pt-28">
        <GameList />
      </div>
    </PageLayout>
  );
}
