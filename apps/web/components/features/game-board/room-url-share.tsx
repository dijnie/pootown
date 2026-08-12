"use client";

import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckIcon,
  CopyIcon,
  Share2,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";
import { formatAddress } from "@/lib/utils";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";

export function RoomUrlShare() {
  const { address: gameId } = useParams<{ address: string }>();
  const [copyToClipboard, isCopied] = useCopyToClipboard();
  const router = useRouter();

  const handleCopyRoomUrl = () => {
    if (!gameId) return;

    const roomUrl = `${window.location.origin}/game/${gameId}`;
    copyToClipboard(roomUrl);
    toast.success("Room URL copied to clipboard!");
  };

  const handleBackToLobby = () => {
    router.push("/lobby");
  };

  if (!gameId) return null;

  //   const currentPlayers = gameState?.currentPlayers || 0;
  //   const maxPlayers = gameState?.maxPlayers || 0;

  return (
    <Card className="bg-white">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            Room Info
          </CardTitle>
          <Button
            onClick={handleBackToLobby}
            variant="neutral"
            size="sm"
            className="flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" />
            Lobby
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Room ID */}
        <div className="bg-secondary-background flex items-center gap-2 rounded-base border-2 border-border p-3">
          <div className="text-xs text-foreground/70 font-base">Room ID</div>
          <div className="text-sm font-mono text-foreground">
            {formatAddress(gameId, 6)}
          </div>
        </div>

        {/* Game Info */}
        <div className="space-y-3">
          {/* <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-foreground/70" />
              <span className="text-sm font-base">Players</span>
            </div>
            <Badge variant="neutral" className="text-xs">
              {currentPlayers}/{maxPlayers}
            </Badge>
          </div> */}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-foreground/70" />
              <span className="text-sm font-base">Room state</span>
            </div>
            <Badge
              variant="neutral"
              className="text-xs bg-blue-100 text-blue-800 border-blue-200"
            >
              Server verified
            </Badge>
          </div>
        </div>

        {/* Copy Button */}
        <Button onClick={handleCopyRoomUrl} size="sm" className="w-full">
          {isCopied ? (
            <>
              <CheckIcon className="h-4 w-4" />
              Copied!
            </>
          ) : (
            <>
              <CopyIcon className="h-4 w-4" />
              Copy Room Link
            </>
          )}
        </Button>

        <p className="text-xs text-foreground/70 text-center font-base">
          Share this link with friends to invite them to play
        </p>
      </CardContent>
    </Card>
  );
}
