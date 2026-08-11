"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import React, { useState, useEffect } from "react";
import { useGameContext } from "@/components/providers/game-provider";
import { cn } from "@/lib/utils";
import { CardData } from "@/types/space-types";
import { surpriseCards, treasureCards } from "@/configs/board-data";
import Image from "next/image";
import { useGameEventsContext } from "@/components/providers/game-events-provider";

interface CardDrawModalProps {
  isOpen: boolean;
  cardType: "chance" | "community-chest";
  onClose?: () => void;
}

export const CardDrawModal: React.FC<CardDrawModalProps> = ({
  isOpen,
  cardType,
  onClose,
}) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawnCard, setDrawnCard] = useState<CardData | null>(null);
  const [showCard, setShowCard] = useState(false);
  const [animationPhase, setAnimationPhase] = useState<
    "idle" | "drawing" | "revealing" | "complete"
  >("idle");

  const [rollingCards, setRollingCards] = useState<CardData[]>([]);
  const [rollingIndex, setRollingIndex] = useState(0);
  const rollingTimerRef = React.useRef<number | null>(null);

  const { drawChanceCard, drawCommunityChestCard } = useGameContext();

  const { registerEventHandler } = useGameEventsContext();

  const [isFlipped, setIsFlipped] = useState(false);

  const cardDeck = cardType === "chance" ? surpriseCards : treasureCards;
  const cardTitle = cardType === "chance" ? "CHANCE" : "COMMUNITY CHEST";
  const cardIcon =
    cardType === "chance" ? "/images/pump.png" : "/images/airdrop.png";

  useEffect(() => {
    if (isOpen) {
      // Reset state when modal opens
      setIsDrawing(false);
      setDrawnCard(null);
      setShowCard(false);
      setAnimationPhase("idle");
      setIsFlipped(false);
      setRollingCards(cardDeck);
      setRollingIndex(0);
      if (rollingTimerRef.current) {
        window.clearInterval(rollingTimerRef.current);
        rollingTimerRef.current = null;
      }
    } else {
      // Cleanup on close
      if (rollingTimerRef.current) {
        window.clearInterval(rollingTimerRef.current);
        rollingTimerRef.current = null;
      }
    }
  }, [isOpen, cardDeck]);

  useEffect(() => {
    const unsubscribeChance = registerEventHandler(
      "ChanceCardDrawn",
      (latestCardDraw) => {
        if (!isDrawing) return;

        const cardIndex = latestCardDraw.cardIndex ?? 0;
        const card = surpriseCards[cardIndex];

        // Stop rolling and reveal card
        if (rollingTimerRef.current) {
          window.clearInterval(rollingTimerRef.current);
          rollingTimerRef.current = null;
        }

        if (card) {
          setDrawnCard(card);
          setAnimationPhase("revealing");

          // Show the card after a brief delay for smoothness
          setTimeout(() => {
            setShowCard(true);
            setAnimationPhase("complete");
            setIsDrawing(false);
            // We are already flipped at this point; ensure it stays front-facing
            setIsFlipped(true);
          }, 500);
        }
      }
    );

    const unsubscribeCommunity = registerEventHandler(
      "CommunityChestCardDrawn",
      (latestCardDraw) => {
        console.log("latestCardDraw", latestCardDraw, isDrawing);
        if (!isDrawing) return;

        const cardIndex = latestCardDraw.cardIndex ?? 0;
        const card = treasureCards[cardIndex];

        // Stop rolling and reveal card
        if (rollingTimerRef.current) {
          window.clearInterval(rollingTimerRef.current);
          rollingTimerRef.current = null;
        }

        if (card) {
          setDrawnCard(card);
          setAnimationPhase("revealing");

          // Show the card after a brief delay for smoothness
          setTimeout(() => {
            setShowCard(true);
            setAnimationPhase("complete");
            setIsDrawing(false);
            // We are already flipped at this point; ensure it stays front-facing
            setIsFlipped(true);
          }, 500);
        }
      }
    );

    return () => {
      unsubscribeChance();
      unsubscribeCommunity();
    };
  }, [registerEventHandler, isDrawing, cardDeck, cardType]);

  const startRolling = React.useCallback(() => {
    if (rollingTimerRef.current) {
      window.clearInterval(rollingTimerRef.current);
    }
    rollingTimerRef.current = window.setInterval(() => {
      setRollingIndex(
        (prev) => (prev + 1) % Math.max(rollingCards.length || 1, 1)
      );
    }, 200);
  }, [rollingCards.length]);

  const drawCard = async () => {
    if (isDrawing) return;

    setIsDrawing(true);
    setAnimationPhase("drawing");
    setIsFlipped(true);
    startRolling();

    try {
      if (cardType === "chance") {
        await drawChanceCard();
      } else {
        await drawCommunityChestCard();
      }
    } catch (error) {
      console.error("Error drawing card:", error);
      if (rollingTimerRef.current) {
        window.clearInterval(rollingTimerRef.current);
        rollingTimerRef.current = null;
      }
      setIsDrawing(false);
      setAnimationPhase("idle");
      setIsFlipped(false);
    }
  };

  const handleCardClick = async () => {
    if (!isDrawing && !drawnCard) {
      await drawCard();
      return;
    }
  };

  const handleClose = () => {
    setShowCard(false);
    setDrawnCard(null);
    setAnimationPhase("idle");
    if (rollingTimerRef.current) {
      window.clearInterval(rollingTimerRef.current);
      rollingTimerRef.current = null;
    }
    onClose?.();
  };

  const displayCard: CardData | null =
    drawnCard ?? (isDrawing ? cardDeck[rollingIndex] : null);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className="!max-w-xs aspect-[3/4] w-full p-0 bg-board-bg border-[3.5px] border-black rounded-none"
        overlayClassName="bg-black/50"
        showCloseButton={false}
      >
        <div
          className="w-full h-full relative transition-transform duration-700 transform cursor-pointer"
          style={{
            transformStyle: "preserve-3d",
            transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
          onClick={handleCardClick}
        >
          {/* Card back */}
          <div
            className={cn(
              "absolute inset-0 w-full h-full text-black rounded-none flex items-center justify-center backface-hidden"
            )}
            style={{ backfaceVisibility: "hidden" }}
          >
            <div className="text-center">
              <div className="w-24 h-24 relative rounded-full mx-auto mb-4  overflow-hidden">
                <Image src={cardIcon} alt={cardTitle} fill />
              </div>
              <p className="font-semibold">{cardTitle}</p>
              {!isFlipped && (
                <p className="text-sm mt-4 animate-pulse">Tap to draw</p>
              )}
            </div>
          </div>

          {/* Card front */}
          <div
            className={`absolute inset-0 w-full h-full text-black bg-board-space rounded-none p-4 backface-hidden`}
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <div className="w-full h-full text-center flex flex-col items-center justify-center">
              <div className="p-4">
                <h3 className="text-lg font-bold text-balance mb-4">
                  {displayCard ? displayCard.title : "Drawing..."}
                </h3>
                <p className="text-sm">
                  {displayCard
                    ? displayCard.description
                    : "Waiting for on-chain result..."}
                </p>
              </div>
              {/* <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-bold text-balance">
                  {displayCard ? displayCard.title : "Drawing..."}
                </h3>
                <span className="text-sm px-2 py-1">
                  {cardType === "chance" ? "CHANCE" : "COMMUNITY CHEST"}
                </span>
              </div> */}

              {/* <div className="flex-1 rounded-lg p-3 mb-4">
                <div className="w-full h-32 rounded mb-3 flex items-center justify-center">
                  Simple visual flourish while drawing
                  {animationPhase === "drawing" && !drawnCard ? (
                    <div className="flex items-center gap-2">
                      <span className="text-2xl animate-bounce">🎴</span>
                      <span className="text-sm opacity-80 animate-pulse">
                        Shuffling...
                      </span>
                    </div>
                  ) : (
                    <span className="text-4xl opacity-70">🎴</span>
                  )}
                </div>
              </div> */}

              {/* <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">
                    {displayCard
                      ? displayCard.action.replaceAll("-", " ").toUpperCase()
                      : "PENDING"}
                  </span>
                  <span className="font-semibold">
                    {displayCard
                      ? displayCard.value
                        ? `±$${displayCard.value}`
                        : "—"
                      : "—"}
                  </span>
                </div>
                <p className="text-sm">
                  {displayCard
                    ? displayCard.description
                    : "Waiting for on-chain result..."}
                </p>
              </div> */}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
