"use client";

import { PlayerList } from "./player-list";
import { RoomUrlShare } from "./room-url-share";
import { GameSettingsDialog } from "./game-settings-dialog";

interface LeftPanelProps {
  onRotateCW: () => void;
  onRotateCCW: () => void;
  boardRotation: number;
}

export function LeftPanel({
  onRotateCW,
  onRotateCCW,
  boardRotation,
}: LeftPanelProps) {
  return (
    <div className="p-4 pr-2 lg:pr-4 space-y-4 md:space-y-6 h-full overflow-auto">
      <RoomUrlShare />
      <PlayerList />

      {/* Game Settings Button */}
      <GameSettingsDialog
        onRotateCW={onRotateCW}
        onRotateCCW={onRotateCCW}
        boardRotation={boardRotation}
      />
    </div>
  );
}
