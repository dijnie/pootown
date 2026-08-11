"use client";

import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getCardData, getPropertyName } from "@/lib/log-utils";
import { cn, formatAddress } from "@/lib/utils";
import { GameLogEntry } from "@/types/space-types";
import { useWallet } from "@/hooks/use-wallet";
import { UserAvatar } from "@/components/user-avatar";
import { useGameLogs } from "@/components/providers/game-logs-provider";
import { getTypedSpaceData } from "@/lib/board-utils";

interface GameLogsProps {
  showTimestamps?: boolean;
  showIcons?: boolean;
  autoScroll?: boolean;
}

export const GameLogs: React.FC<GameLogsProps> = ({
  showTimestamps = false,
  showIcons = true,
  autoScroll = true,
}) => {
  const { gameLogs } = useGameLogs();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { wallet } = useWallet();

  useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = 0;
      }
    }
  }, [gameLogs, autoScroll]);

  if (gameLogs.length === 0) {
    return null;
  }

  return (
    <div
      id="game-logs-container"
      ref={containerRef}
      className="relative h-full"
    >
      <ScrollArea
        ref={scrollAreaRef}
        className={cn(
          "flex flex-col mx-auto w-full max-w-xs h-32 md:h-48 lg:hh-64 2xl:h-80"
        )}
      >
        <div className="p-2 text-center flex flex-col gap-1.5 space-y-1.5 w-full">
          <AnimatePresence initial={false}>
            {gameLogs.map((log, index) => (
              <motion.div
                className="w-full"
                key={log.id || `${log.timestamp}-${index}`}
                initial={{
                  opacity: 0,
                  y: -20,
                  scale: 0.95,
                  filter: "blur(4px)",
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  filter: "blur(0px)",
                }}
                exit={{
                  opacity: 0,
                  y: -10,
                  scale: 0.95,
                  filter: "blur(2px)",
                }}
                transition={{
                  duration: 0.4,
                  ease: [0.25, 0.46, 0.45, 0.94],
                  delay: index === 0 ? 0.1 : 0,
                }}
                layout
              >
                <GameLogItem
                  log={log}
                  showTimestamp={showTimestamps}
                  showIcon={showIcons}
                  currentPlayerAddress={wallet?.address}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
};

interface GameLogItemProps {
  log: GameLogEntry;
  showTimestamp?: boolean;
  showIcon?: boolean;
  currentPlayerAddress?: string;
}

function GameLogItem({ log, currentPlayerAddress }: GameLogItemProps) {
  return (
    <LogMessageRenderer log={log} currentPlayerAddress={currentPlayerAddress} />
  );
}

interface LogMessageRendererProps {
  log: GameLogEntry;
  currentPlayerAddress?: string;
}

interface PlayerDisplayProps {
  playerId: string;
  currentPlayerAddress?: string;
  showAvatar?: boolean;
  showWalletAddress?: boolean;
}

const PlayerDisplay: React.FC<PlayerDisplayProps> = ({
  playerId,
  currentPlayerAddress,
  showAvatar = true,
  showWalletAddress = false,
}) => {
  const isCurrentPlayer = currentPlayerAddress === playerId;

  if (isCurrentPlayer) {
    return (
      <span className="inline-flex items-center gap-1">
        {showAvatar && <UserAvatar walletAddress={playerId} size="xs" />}
        <span className="font-semibold text-blue-600">You</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      {showAvatar && <UserAvatar walletAddress={playerId} size="xs" />}
      {showWalletAddress && (
        <span className="font-medium">{formatAddress(playerId)}</span>
      )}
    </span>
  );
};

const LogMessageRenderer: React.FC<LogMessageRendererProps> = ({
  log,
  currentPlayerAddress,
}) => {
  const { type, playerId, details = {} } = log;

  const renderMessage = () => {
    switch (type) {
      case "PlayerJoined":
        return (
          <>
            <PlayerDisplay
              playerId={playerId}
              currentPlayerAddress={currentPlayerAddress}
            />
            <span> joined the game</span>
          </>
        );

      case "PlayerLeft":
        return (
          <>
            <PlayerDisplay
              playerId={playerId}
              currentPlayerAddress={currentPlayerAddress}
            />
            <span> left the game</span>
          </>
        );

      case "GameStarted":
        return (
          <div className="text-center font-semibold w-full text-green-600">
            🎲 Game started! 🎲
          </div>
        );

      case "GameCancelled":
        return (
          <div className="text-center font-semibold w-full text-red-600">
            ❌ Game cancelled ❌
          </div>
        );

      case "PlayerPassedGo":
        return (
          <>
            <PlayerDisplay
              playerId={playerId}
              currentPlayerAddress={currentPlayerAddress}
            />
            <span> passed </span>
            <span className="font-medium text-yellow-600">Solana Genesis</span>
            <span> and collected </span>
            <span className="font-semibold text-green-500">
              ${details.amount}
            </span>
          </>
        );

      case "PropertyPurchased":
        const propertyName =
          details.propertyName || getPropertyName(details.position || 0);
        return (
          <>
            <PlayerDisplay
              playerId={playerId}
              currentPlayerAddress={currentPlayerAddress}
            />
            <span> bought </span>
            <span className="font-medium text-blue-600">{propertyName}</span>
            <span> for </span>
            <span className="font-semibold text-green-500">
              ${details.price}
            </span>
          </>
        );

      case "PropertyDeclined":
        const declinedPropertyName =
          details.propertyName || getPropertyName(details.position || 0);
        return (
          <>
            <PlayerDisplay
              playerId={playerId}
              currentPlayerAddress={currentPlayerAddress}
            />
            <span> declined to buy </span>
            <span className="font-medium text-gray-600">
              {declinedPropertyName}
            </span>
          </>
        );

      case "RentPaid":
        const rentPropertyName =
          details.propertyName || getPropertyName(details.position || 0);
        return (
          <>
            <PlayerDisplay
              playerId={playerId}
              currentPlayerAddress={currentPlayerAddress}
            />
            <span> paid </span>
            <span className="font-semibold text-red-500">
              ${details.amount}
            </span>
            <span> rent to </span>
            <PlayerDisplay
              playerId={details.owner || ""}
              currentPlayerAddress={currentPlayerAddress}
            />
            <span> for </span>
            <span className="font-medium text-blue-600">
              {rentPropertyName}
            </span>
          </>
        );

      case "ChanceCardDrawn":
        const chanceCard = getCardData("chance", details.cardIndex || 0);
        return (
          <>
            <PlayerDisplay
              playerId={playerId}
              currentPlayerAddress={currentPlayerAddress}
            />
            <span> drew </span>
            <span className="font-medium text-purple-600">
              Pump.fun Surprise
            </span>
            {chanceCard && (
              <>
                <span>: </span>
                <span className="font-medium">{chanceCard.title}</span>
              </>
            )}
          </>
        );

      case "CommunityChestCardDrawn":
        const treasureCard = getCardData(
          "community-chest",
          details.cardIndex || 0
        );
        return (
          <>
            <PlayerDisplay
              playerId={playerId}
              currentPlayerAddress={currentPlayerAddress}
            />
            <span> drew </span>
            <span className="font-medium text-orange-600">Airdrop Chest</span>
            {treasureCard && (
              <>
                <span>: </span>
                <span className="font-medium">{treasureCard.title}</span>
              </>
            )}
          </>
        );

      case "HouseBuilt":
        const housePropertyName =
          details.propertyName || getPropertyName(details.position || 0);
        return (
          <>
            <PlayerDisplay
              playerId={playerId}
              currentPlayerAddress={currentPlayerAddress}
            />
            <span> built a </span>
            <span className="font-medium text-green-600">house</span>
            <span> on </span>
            <span className="font-medium text-blue-600">
              {housePropertyName}
            </span>
          </>
        );

      case "HotelBuilt":
        const hotelPropertyName =
          details.propertyName || getPropertyName(details.position || 0);
        return (
          <>
            <PlayerDisplay
              playerId={playerId}
              currentPlayerAddress={currentPlayerAddress}
            />
            <span> built a </span>
            <span className="font-medium text-purple-600">hotel</span>
            <span> on </span>
            <span className="font-medium text-blue-600">
              {hotelPropertyName}
            </span>
          </>
        );

      case "BuildingSold":
        const soldPropertyName =
          details.propertyName || getPropertyName(details.position || 0);
        return (
          <>
            <PlayerDisplay
              playerId={playerId}
              currentPlayerAddress={currentPlayerAddress}
            />
            <span> sold a </span>
            <span className="font-medium text-orange-600">
              {details.buildingType}
            </span>
            <span> on </span>
            <span className="font-medium text-blue-600">
              {soldPropertyName}
            </span>
            <span> for </span>
            <span className="font-semibold text-green-500">
              ${details.price}
            </span>
          </>
        );

      case "PropertyMortgaged":
        const mortgagedPropertyName =
          details.propertyName || getPropertyName(details.position || 0);
        return (
          <>
            <PlayerDisplay
              playerId={playerId}
              currentPlayerAddress={currentPlayerAddress}
            />
            <span> mortgaged </span>
            <span className="font-medium text-blue-600">
              {mortgagedPropertyName}
            </span>
            <span> for </span>
            <span className="font-semibold text-green-500">
              ${details.price}
            </span>
          </>
        );

      case "PropertyUnmortgaged":
        const unmortgagedPropertyName =
          details.propertyName || getPropertyName(details.position || 0);
        return (
          <>
            <PlayerDisplay
              playerId={playerId}
              currentPlayerAddress={currentPlayerAddress}
            />
            <span> unmortgaged </span>
            <span className="font-medium text-blue-600">
              {unmortgagedPropertyName}
            </span>
            <span> for </span>
            <span className="font-semibold text-red-500">${details.price}</span>
          </>
        );

      case "TaxPaid":
        return (
          <>
            <PlayerDisplay
              playerId={playerId}
              currentPlayerAddress={currentPlayerAddress}
            />
            <span>paid</span>
            <span className="font-semibold text-red-500">
              ${details.amount}
            </span>
            <span className="font-semibold text-blue-500">
              {getTypedSpaceData(details.position || 0, "tax")?.name}
            </span>
            <span>tax</span>
          </>
        );

      case "SpecialSpaceAction":
        let specialMessage = "";
        switch (details.spaceType) {
          case 0: // Go to jail
            specialMessage = " went to Validator Jail";
            break;
          case 1: // Free parking
            specialMessage = " landed on Free Airdrop Parking";
            break;
          case 2: // Go to jail space
            specialMessage = " was sent to Validator Jail";
            break;
          default:
            specialMessage = " landed on a special space";
        }

        return (
          <>
            <PlayerDisplay
              playerId={playerId}
              currentPlayerAddress={currentPlayerAddress}
            />
            <span>{specialMessage}</span>
          </>
        );

      case "TradeCreated":
        return (
          <>
            <PlayerDisplay
              playerId={playerId}
              currentPlayerAddress={currentPlayerAddress}
            />
            <span> created a trade with </span>
            <PlayerDisplay
              playerId={details.targetPlayer || ""}
              currentPlayerAddress={currentPlayerAddress}
            />
          </>
        );

      case "TradeAccepted":
        return (
          <>
            <PlayerDisplay
              playerId={playerId}
              currentPlayerAddress={currentPlayerAddress}
            />
            <span> accepted a trade from </span>
            <PlayerDisplay
              playerId={details.targetPlayer || ""}
              currentPlayerAddress={currentPlayerAddress}
            />
          </>
        );

      case "TradeRejected":
        return (
          <>
            <PlayerDisplay
              playerId={playerId}
              currentPlayerAddress={currentPlayerAddress}
            />
            <span> rejected a trade from </span>
            <PlayerDisplay
              playerId={details.targetPlayer || ""}
              currentPlayerAddress={currentPlayerAddress}
            />
          </>
        );

      case "TradeCancelled":
        return (
          <>
            <PlayerDisplay
              playerId={playerId}
              currentPlayerAddress={currentPlayerAddress}
            />
            <span> cancelled their trade</span>
          </>
        );

      case "TradesCleanedUp":
        return (
          <div className="text-center font-medium w-full text-gray-600">
            🧹 Expired trades cleaned up
          </div>
        );

      case "PlayerBankrupt":
        return (
          <>
            <PlayerDisplay
              playerId={playerId}
              currentPlayerAddress={currentPlayerAddress}
            />
            <span> declared </span>
            <span className="font-semibold text-red-600">bankruptcy</span>
          </>
        );

      case "GameEnded":
        const winner = details.winner;
        if (winner) {
          return (
            <div className="text-center font-semibold w-full text-yellow-600">
              🏆{" "}
              <PlayerDisplay
                playerId={winner}
                currentPlayerAddress={currentPlayerAddress}
                showAvatar={false}
                showWalletAddress={true}
              />{" "}
              won the game! 🏆
            </div>
          );
        }
        return (
          <div className="text-center font-semibold w-full text-gray-600">
            🎮 Game ended with no winner 🎮
          </div>
        );

      case "GameEndConditionMet":
        return (
          <div className="text-center font-medium w-full text-orange-600">
            ⏰ Game end condition met
          </div>
        );

      case "PrizeClaimed":
        return (
          <>
            <PlayerDisplay
              playerId={playerId}
              currentPlayerAddress={currentPlayerAddress}
            />
            <span> claimed their prize of </span>
            <span className="font-semibold text-green-500">
              ${details.prizeAmount}
            </span>
          </>
        );

      default:
        // Fallback for unknown event types
        return (
          <>
            <PlayerDisplay
              playerId={playerId}
              currentPlayerAddress={currentPlayerAddress}
            />
            <span> performed an action</span>
          </>
        );
    }
  };

  return (
    <div className="text-xs w-full text-center gap-x-1 gap-y-0.5 leading-relaxed flex justify-center items-center flex-wrap">
      {renderMessage()}
    </div>
  );
};
