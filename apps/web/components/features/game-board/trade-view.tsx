"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowRight, Plus, Check, X } from "lucide-react";
import { formatAddress } from "@/lib/utils";
import { useGameContext } from "@/components/providers/game-provider";
import { CreateTradeDialog } from "./trade-modal";
import { GameStatus, TradeStatus } from "@/lib/sdk/generated";
import { getTypedSpaceData } from "@/lib/board-utils";
import { colorMap, ColorGroup } from "@/configs/board-data";
import type { TradeInfo } from "@/types/schema";
import { useWallet } from "@/hooks/use-wallet";

const getTradeStatusText = (status: TradeStatus): string => {
  switch (status) {
    case 0:
      return "Pending";
    case 1:
      return "Accepted";
    case 2:
      return "Rejected";
    case 3:
      return "Cancelled";
    case 4:
      return "Expired";
    default:
      return "Unknown";
  }
};

const getTradeDirection = (
  trade: TradeInfo,
  currentPlayer?: string
): "received" | "sent" => {
  return trade.receiver === currentPlayer ? "received" : "sent";
};

const getPropertyColor = (property: number | null): string => {
  if (property === null) return "";
  const propertyData = getTypedSpaceData(property, "property");
  if (!propertyData) return "";
  return colorMap[propertyData.colorGroup as ColorGroup] || "";
};

const getOfferDisplay = (money: number | string, property: number | null) => {
  const moneyAmount = typeof money === "string" ? parseInt(money) : money;
  const parts: string[] = [];

  if (moneyAmount > 0) {
    parts.push(`$${moneyAmount}`);
  }

  if (property !== null) {
    const propertyData = getTypedSpaceData(property, "property");
    if (propertyData) {
      parts.push(propertyData.name);
    } else {
      parts.push(`Property #${property}`);
    }
  }

  return parts.length > 0 ? parts.join(" + ") : "Nothing";
};

export function TradeView() {
  const { wallet } = useWallet();
  const { gameState, acceptTrade, rejectTrade, cancelTrade } = useGameContext();
  const activeTrades = gameState?.activeTrades || [];

  const [isCreateTradeOpen, setIsCreateTradeOpen] = useState(false);

  const handleCreateTrade = () => {
    setIsCreateTradeOpen(true);
  };

  const handleAccept = async (tradeId: number, proposer: string) => {
    try {
      await acceptTrade(tradeId.toString(), proposer);
    } catch (error) {
      console.error("Error accepting trade:", error);
    }
  };

  const handleReject = async (tradeId: number) => {
    try {
      await rejectTrade(tradeId.toString());
    } catch (error) {
      console.error("Error rejecting trade:", error);
    }
  };

  const handleCancel = async (tradeId: number) => {
    try {
      await cancelTrade(tradeId.toString());
    } catch (error) {
      console.error("Error canceling trade:", error);
    }
  };

  return (
    <Card className="bg-white">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Trades</CardTitle>
        <Button
          size="sm"
          className="h-8 px-3"
          onClick={handleCreateTrade}
          disabled={gameState?.gameStatus !== GameStatus.InProgress}
        >
          <Plus className="w-4 h-4 mr-1" />
          Create
        </Button>
      </CardHeader>
      <CardContent className="px-0">
        {activeTrades.length === 0 ? (
          <div className="text-center py-6">
            <p>No active trades</p>
            <p className="text-sm mt-1">Create a trade to get started</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[500px] px-3">
            <div className="space-y-4">
              {activeTrades.map((trade) => (
                <TradeItem
                  key={trade.id}
                  trade={trade}
                  currentPlayer={wallet?.address}
                  onAccept={handleAccept}
                  onReject={handleReject}
                  onCancel={handleCancel}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      <CreateTradeDialog
        open={isCreateTradeOpen}
        onOpenChange={setIsCreateTradeOpen}
      />
    </Card>
  );
}

function TradeItem({
  trade,
  currentPlayer,
  onAccept,
  onReject,
  onCancel,
}: {
  trade: TradeInfo;
  currentPlayer?: string;
  onAccept: (tradeId: number, proposer: string) => void;
  onReject: (tradeId: number) => void;
  onCancel: (tradeId: number) => void;
}) {
  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);

  const direction = getTradeDirection(trade, currentPlayer);
  const isInvoled =
    currentPlayer === trade.proposer || currentPlayer === trade.receiver;

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      await onAccept(trade.id, trade.proposer);
    } finally {
      setIsAccepting(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      await onReject(trade.id);
    } finally {
      setIsRejecting(false);
    }
  };

  const handleCancel = async () => {
    setIsCanceling(true);
    try {
      await onCancel(trade.id);
    } finally {
      setIsCanceling(false);
    }
  };

  return (
    <Card key={trade.id} className="border-2">
      <CardContent>
        <div className="space-y-4">
          {/* Trade Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar className="size-4 rounded-full overflow-hidden">
                <AvatarImage
                  walletAddress={trade.proposer}
                  alt={`Player ${formatAddress(trade.proposer)}`}
                />
                <AvatarFallback
                  walletAddress={trade.proposer}
                  className="text-white font-semibold"
                >
                  {formatAddress(trade.proposer).substring(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium text-sm">
                {formatAddress(trade.proposer, 3)}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <Avatar className="size-4 rounded-full overflow-hidden">
                <AvatarImage
                  walletAddress={trade.receiver}
                  alt={`Player ${formatAddress(trade.receiver)}`}
                />
                <AvatarFallback
                  walletAddress={trade.receiver}
                  className="text-white font-semibold"
                >
                  {formatAddress(trade.receiver).substring(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium text-sm">
                {formatAddress(trade.receiver, 3)}
              </span>
            </div>
          </div>

          <Separator />

          {/* Trade Details */}
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-1">
              <div className="text-xs text-muted-foreground font-medium uppercase">
                Offering
              </div>
              <div className="flex items-center gap-2">
                {trade.proposerProperty !== null && (
                  <div
                    className="w-3 h-3 rounded"
                    style={{
                      backgroundColor: getPropertyColor(trade.proposerProperty),
                    }}
                  />
                )}
                <span className="font-semibold text-sm">
                  {getOfferDisplay(trade.proposerMoney, trade.proposerProperty)}
                </span>
              </div>
            </div>

            <ArrowRight className="size-4 text-muted-foreground flex-shrink-0" />

            <div className="flex-1 space-y-1">
              <div className="text-xs text-muted-foreground font-medium uppercase">
                Requesting
              </div>
              <div className="flex items-center gap-2">
                {trade.receiverProperty !== null && (
                  <div
                    className="w-3 h-3 rounded"
                    style={{
                      backgroundColor: getPropertyColor(trade.receiverProperty),
                    }}
                  />
                )}
                <span className="font-semibold text-sm">
                  {getOfferDisplay(trade.receiverMoney, trade.receiverProperty)}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          {trade.status === TradeStatus.Pending && isInvoled && (
            <div className="flex gap-2 pt-2">
              {direction === "received" ? (
                <>
                  <Button
                    size="sm"
                    className="flex-1 gap-2"
                    variant="neutral"
                    onClick={handleAccept}
                    disabled={isAccepting || isRejecting}
                    loading={isAccepting}
                  >
                    <Check className="h-4 w-4" />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 gap-2"
                    onClick={handleReject}
                    disabled={isAccepting || isRejecting}
                    loading={isRejecting}
                  >
                    <X className="h-4 w-4" />
                    Reject
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  className="w-full gap-2 bg-transparent"
                  onClick={handleCancel}
                  disabled={isCanceling}
                  loading={isCanceling}
                >
                  <X className="h-4 w-4" />
                  Cancel Trade
                </Button>
              )}
            </div>
          )}

          {/* Trade Status for non-pending trades */}
          {trade.status !== 0 && (
            <div className="pt-2">
              <Badge
                // variant={getTradeStatusVariant(trade.status)}
                className="w-full justify-center"
              >
                {getTradeStatusText(trade.status)}
              </Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
