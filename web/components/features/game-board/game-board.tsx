"use client";

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  PropertySpace,
  ChanceSpace,
  CommunityChestSpace,
  RailroadSpace,
  UtilitySpace,
  TaxSpace,
} from "./board-spaces";
import {
  getBoardRowData,
  isChanceSpace,
  isCommunityChestSpace,
  isPropertySpace,
  isRailroadSpace,
  isTaxSpace,
  isUtilitySpace,
} from "@/lib/board-utils";

import { PlayerTokensContainer } from "./player-tokens";
import { DiceProvider } from "./dice";
import { CardDrawModal } from "./card-draw-modal";
import { useGameContext } from "@/components/providers/game-provider";
import { PlayerActions } from "./player-actions";
import { PropertyAccount } from "@/types/schema";
import { BoardSpace } from "@/configs/board-data";
import {
  FreeParkingCorner,
  GoCorner,
  GoToJailCorner,
  JailCorner,
} from "./corner-spaces";
import { useWallet } from "@/hooks/use-wallet";
import { Button } from "@/components/ui/button";
import { RotateCw, RotateCcw } from "lucide-react";
import { GameLogs } from "./game-logs";
import { useRouter } from "next/navigation";
import { GameStatus } from "@/lib/sdk/generated";
import { ClaimRewardButton } from "./claim-reward-button";
import { useLogin } from "@privy-io/react-auth";

interface MonopolyBoardProps {
  boardRotation: number;
}

const GameBoard: React.FC<MonopolyBoardProps> = ({ boardRotation }) => {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  // const [boardRotation, setBoardRotation] = useState<number>(0);

  const { ready, authenticated, wallet } = useWallet();
  const { login } = useLogin();
  const disableLogin = !ready || (ready && authenticated);

  const router = useRouter();

  const {
    gameState,
    players,
    properties,
    currentPlayerState,
    isCardDrawModalOpen,
    setIsCardDrawModalOpen,
    cardDrawType,
    setCardDrawType,
    // Actions
    startGame,
    joinGame,
    endTurn,
    buyProperty,
    skipProperty,
    payMevTax,
    payPriorityFeeTax,
    payJailFine,
    useGetOutOfJailCard,
    endGame,
    cancelGame,
    leaveGame,
  } = useGameContext();

  const handleStartGame = async (_gameAddress: string) => {
    try {
      setIsLoading("startGame");
      await startGame();
    } catch (error) {
      console.error("Failed to start game:", error);
    } finally {
      setIsLoading(null);
    }
  };

  const handleJoinGame = async (_gameAddress: string) => {
    try {
      setIsLoading("joinGame");
      await joinGame();
    } catch (error) {
      console.error("Failed to join game:", error);
    } finally {
      setIsLoading(null);
    }
  };

  const handleBuyProperty = async (position: number) => {
    setIsLoading("buyProperty");
    try {
      await buyProperty(position);
    } catch (error) {
      console.error("Failed to buy property:", error);
    } finally {
      setIsLoading(null);
    }
  };

  const handleSkipProperty = async (position: number) => {
    setIsLoading("skipProperty");
    try {
      await skipProperty(position);
    } catch (error) {
      console.error("Failed to skip property:", error);
    } finally {
      setIsLoading(null);
    }
  };

  const handleEndTurn = async () => {
    setIsLoading("endTurn");
    try {
      await endTurn();
    } catch (error) {
      console.error("Failed to end turn:", error);
    } finally {
      setIsLoading(null);
    }
  };

  const handlePayMevTax = async () => {
    setIsLoading("tax");
    try {
      await payMevTax();
    } catch (error) {
      console.error("Failed to pay MEV tax:", error);
    } finally {
      setIsLoading(null);
    }
  };

  const handlePayPriorityFeeTax = async () => {
    setIsLoading("tax");
    try {
      await payPriorityFeeTax();
    } catch (error) {
      console.error("Failed to pay priority fee tax:", error);
    } finally {
      setIsLoading(null);
    }
  };

  const handlePayJailFine = async () => {
    setIsLoading("payJailFine");
    try {
      await payJailFine();
    } catch (error) {
      console.error("Failed to pay jail fine:", error);
    } finally {
      setIsLoading(null);
    }
  };

  const handleGetOutOfJailCard = async () => {
    setIsLoading("getOutOfJailCard");
    try {
      await useGetOutOfJailCard();
    } catch (error) {
      console.error("Failed to get out of jail card:", error);
    } finally {
      setIsLoading(null);
    }
  };

  const handleEndGame = async () => {
    setIsLoading("endGame");
    try {
      await endGame();
    } catch (error) {
      console.error("Failed to end game:", error);
    } finally {
      setIsLoading(null);
    }
  };

  const handleCancelGame = async () => {
    setIsLoading("cancelGame");
    try {
      await cancelGame();
      router.push("/lobby");
    } catch (error) {
      console.error("Failed to cancel game:", error);
    } finally {
      setIsLoading(null);
    }
  };

  const handleLeaveGame = async () => {
    setIsLoading("leaveGame");
    try {
      await leaveGame();
      router.push("/lobby");
    } catch (error) {
      console.error("Failed to leave game:", error);
    } finally {
      setIsLoading(null);
    }
  };

  const renderSpace = (space: BoardSpace, properties: PropertyAccount[]) => {
    const position = space.position;
    const key = `${space.name}-${position}`;
    const onChainProperty = properties?.find(
      (property) => property.position === position
    );

    const baseProps = {
      // key,
      position,
      onChainProperty,
    };

    if (isPropertySpace(space)) {
      return <PropertySpace {...baseProps} {...space} key={key} />;
    } else if (isRailroadSpace(space)) {
      return <RailroadSpace {...baseProps} {...space} key={key} />;
    } else if (isUtilitySpace(space)) {
      return <UtilitySpace {...baseProps} {...space} key={key} />;
    } else if (isTaxSpace(space)) {
      return <TaxSpace {...baseProps} {...space} key={key} />;
    } else if (isChanceSpace(space)) {
      return <ChanceSpace {...baseProps} {...space} key={key} />;
    } else if (isCommunityChestSpace(space)) {
      return <CommunityChestSpace {...baseProps} {...space} key={key} />;
    }

    return null;
  };

  if (!gameState || !currentPlayerState) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-gray-500">
            No game data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden relative">
      <div className="h-full w-full flex items-center justify-center p-4">
        <Card
          className="relative aspect-square bg-white transition-transform duration-500 ease-in-out border-2
                     w-full h-full max-w-[min(100vh,100vw)] max-h-[min(100vh,100vw)]
                     lg:max-w-none lg:max-h-none lg:h-full lg:w-auto"
          style={{ transform: `rotate(${boardRotation}deg)` }}
        >
          <div className="absolute inset-0 grid grid-cols-14 grid-rows-14">
            {/* Player Tokens */}
            <PlayerTokensContainer
              players={players}
              boardRotation={boardRotation}
              currentPlayer={currentPlayerState.wallet}
            />

            {/* Center - Responsive */}
            <div
              className="col-start-3 col-end-13 row-start-3 row-end-13 flex flex-col items-center justify-center 
                           p-1 sm:p-3 md:p-4 gap-1 sm:gap-3 md:gap-4 bg-chart-3/50"
              style={{
                transform: `rotate(${-boardRotation}deg)`,
              }}
            >
              <div className="w-full h-full flex flex-col justify-end items-center">
                {gameState.gameStatus === GameStatus.Finished ? (
                  <GameEndedStatus />
                ) : (
                  <>
                    <div className="flex-1 w-full flex flex-col items-center justify-end">
                      {wallet && wallet?.delegated ? (
                        <DiceProvider>
                          <PlayerActions
                            handleStartGame={handleStartGame}
                            handleJoinGame={handleJoinGame}
                            handleEndTurn={handleEndTurn}
                            handleBuyProperty={handleBuyProperty}
                            handleSkipProperty={handleSkipProperty}
                            handlePayMevTax={handlePayMevTax}
                            handlePayPriorityFeeTax={handlePayPriorityFeeTax}
                            handlePayJailFine={handlePayJailFine}
                            handleGetOutOfJailCard={handleGetOutOfJailCard}
                            handleEndGame={handleEndGame}
                            handleCancelGame={handleCancelGame}
                            handleLeaveGame={handleLeaveGame}
                            isLoading={isLoading}
                            wallet={wallet}
                          />
                        </DiceProvider>
                      ) : (
                        <Button disabled={disableLogin} onClick={login}>
                          Connect Wallet
                        </Button>
                      )}
                    </div>
                    {/* game-logs */}
                    <div className="flex-1 w-full p-4 lg:py-6">
                      <GameLogs />
                    </div>
                  </>
                )}
              </div>
            </div>

            <GoCorner boardRotation={boardRotation} />

            <JailCorner boardRotation={boardRotation} />

            <FreeParkingCorner boardRotation={boardRotation} />

            <GoToJailCorner boardRotation={boardRotation} />

            {/* Bottom Row */}
            <div className="col-start-3 col-end-13 row-start-13 row-end-15 grid grid-cols-9 grid-rows-1 ">
              {getBoardRowData().bottomRow.map((space) =>
                renderSpace(space, properties)
              )}
            </div>

            {/* Left Row */}
            <div className="col-start-1 col-end-3 row-start-3 row-end-13 grid grid-cols-1 grid-rows-9 ">
              {getBoardRowData().leftRow.map((space) =>
                renderSpace(space, properties)
              )}
            </div>

            {/* Top Row */}
            <div className="col-start-3 col-end-13 row-start-1 row-end-3 grid grid-cols-9 grid-rows-1 ">
              {getBoardRowData().topRow.map((space) =>
                renderSpace(space, properties)
              )}
            </div>

            {/* Right Row */}
            <div className="col-start-13 col-end-15 row-start-3 row-end-13 grid grid-cols-1 grid-rows-9 ">
              {getBoardRowData().rightRow.map((space) =>
                renderSpace(space, properties)
              )}
            </div>
          </div>
        </Card>
      </div>

      {cardDrawType && (
        <CardDrawModal
          isOpen={isCardDrawModalOpen}
          cardType={cardDrawType}
          onClose={() => {
            setIsCardDrawModalOpen(false);
            setCardDrawType(null);
          }}
        />
      )}
    </div>
  );
};

function GameEndedStatus() {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <ClaimRewardButton />
    </div>
  );
}

export default GameBoard;
