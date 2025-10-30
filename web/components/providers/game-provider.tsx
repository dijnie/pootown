"use client";

import { useGameState } from "@/hooks/useGameState";
import { sdk } from "@/lib/sdk/sdk";
import { buildAndSendTransactionWithPrivy } from "@/lib/tx";
import {
  GameAccount,
  PlayerAccount,
  PropertyAccount,
  TradeOffer,
} from "@/types/schema";
import { Address, address, TransactionSigner } from "@solana/kit";
import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { GameEvent } from "@/lib/sdk/types";
import {
  getBoardSpaceData,
  getTypedSpaceData,
  calculateRentForProperty,
} from "@/lib/board-utils";
import { useRpcContext } from "./rpc-provider";
import { useWallet } from "@/hooks/use-wallet";
import { playPropertySound, playSound, SOUND_CONFIG } from "@/lib/soundUtil";
import { toast } from "sonner";
import soundUtil from "@/lib/soundUtil";
import { BuildingType, GameStatus, TradeType } from "@/lib/sdk/generated";
import {
  showRentPaymentToast,
  showRentPaymentFallbackToast,
  showRentPaymentErrorToast,
} from "@/lib/toast-utils";
import { USE_VRF } from "@/configs/constants";

interface GameContextType {
  gameAddress: Address | null;
  setGameAddress: (address: Address | null) => void;

  // Current player management
  currentPlayerAddress: string | null;
  currentPlayerState: PlayerAccount | null;
  signer: TransactionSigner | null;

  // Game data (from useGameState hook)
  gameState: GameAccount | null;
  players: PlayerAccount[];
  properties: PropertyAccount[];
  gameLoading: boolean;
  gameError: Error | null;
  refetch: () => Promise<void>;

  // Game actions
  startGame: () => Promise<void>;
  resetGame: () => Promise<void>;
  closeGame: () => Promise<void>;
  joinGame: () => Promise<void>;
  leaveGame: () => Promise<void>;
  cancelGame: () => Promise<void>;
  rollDice: (diceRoll?: number[]) => Promise<void>;
  buyProperty: (position: number) => Promise<void>;
  skipProperty: (position: number) => Promise<void>;
  payRent: (position: number, owner: Address) => Promise<void>;
  endTurn: () => Promise<void>;
  drawChanceCard: () => Promise<void>;
  drawCommunityChestCard: () => Promise<void>;
  payJailFine: () => Promise<void>;
  useGetOutOfJailCard: () => Promise<void>;
  buildHouse: (position: number) => Promise<void>;
  buildHotel: (position: number) => Promise<void>;
  sellBuilding: (position: number, buildingType: BuildingType) => Promise<void>;
  payMevTax: () => Promise<void>;
  payPriorityFeeTax: () => Promise<void>;
  declareBankruptcy: () => Promise<void>;
  endGame: () => Promise<void>;
  claimReward: () => Promise<void>;

  // Trade actions
  createTrade: (
    receiver: string,
    initiatorOffer: TradeOffer,
    targetOffer: TradeOffer
  ) => Promise<void>;
  acceptTrade: (tradeId: string, proposer: string) => Promise<void>;
  rejectTrade: (tradeId: string) => Promise<void>;
  cancelTrade: (tradeId: string) => Promise<void>;

  // UI state management
  selectedProperty: number | null;
  setSelectedProperty: (position: number | null) => void;
  isPropertyDialogOpen: boolean;
  setIsPropertyDialogOpen: (open: boolean) => void;
  isCardDrawModalOpen: boolean;
  setIsCardDrawModalOpen: (open: boolean) => void;
  cardDrawType: "chance" | "community-chest" | null;
  setCardDrawType: (type: "chance" | "community-chest" | null) => void;

  // ui state
  isCurrentTurn: boolean;
  showRollDice: boolean;
  showEndTurn: boolean;
  showPayJailFine: boolean;
  showGetOutOfJailCard: boolean;

  // Utility functions
  getPropertyByPosition: (position: number) => PropertyAccount | null;
  getPlayerByAddress: (address: Address) => PlayerAccount | null;
  isCurrentPlayerTurn: () => boolean;
  canRollDice: () => boolean;
  canPlayerAct: () => boolean;
  // demo
  demoDices: number[] | null;
  setDemoDices: (dices: number[] | null) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const useGameContext = () => {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error("useGameContext must be used within a GameProvider");
  }
  return context;
};

interface GameProviderProps {
  children: ReactNode;
}

export const GameProvider: React.FC<GameProviderProps> = ({ children }) => {
  const [gameAddress, setGameAddress] = useState<Address | null>(null);
  const { wallet } = useWallet();
  const signer =
    wallet?.address && wallet?.delegated
      ? ({ address: address(wallet.address) } as TransactionSigner)
      : null;

  // UI state
  const [selectedProperty, setSelectedProperty] = useState<number | null>(null);
  const [isPropertyDialogOpen, setIsPropertyDialogOpen] = useState(false);
  const [isCardDrawModalOpen, setIsCardDrawModalOpen] = useState(false);
  const [cardDrawType, setCardDrawType] = useState<
    "chance" | "community-chest" | null
  >(null);

  // Add these new state variables to track if modals have been shown
  const [hasShownChanceModal, setHasShownChanceModal] = useState(false);
  const [hasShownCommunityChestModal, setHasShownCommunityChestModal] =
    useState(false);

  // demo
  const [demoDices, setDemoDices] = useState<number[] | null>(null);

  const { rpc, erRpc } = useRpcContext();

  const {
    players,
    properties,
    gameData: gameState,
    isLoading: gameLoading,
    error: gameError,
    refetch,
  } = useGameState(gameAddress);

  const currentPlayerAddress = useMemo(() => {
    return gameState?.players?.[gameState?.currentTurn] || null;
  }, [gameState]);

  const currentPlayerState = useMemo(() => {
    const player = players?.find(
      (player) => player.wallet === currentPlayerAddress
    );
    return player || null;
  }, [currentPlayerAddress, players]);

  // state
  const isInProgress =
    !!gameState && gameState?.gameStatus === GameStatus.InProgress;

  const isCurrentTurn =
    isInProgress &&
    !!wallet?.address &&
    gameState.players[gameState.currentTurn] === wallet.address;

  const showRollDice =
    isCurrentTurn &&
    !!currentPlayerState &&
    !currentPlayerState.hasRolledDice &&
    !currentPlayerState.needsPropertyAction &&
    !currentPlayerState.needsChanceCard &&
    !currentPlayerState.needsCommunityChestCard &&
    !currentPlayerState.needsSpecialSpaceAction &&
    !currentPlayerState.needsBankruptcyCheck;

  const showEndTurn =
    isCurrentTurn &&
    !!currentPlayerState &&
    currentPlayerState.hasRolledDice &&
    !currentPlayerState.needsPropertyAction &&
    !currentPlayerState.needsChanceCard &&
    !currentPlayerState.needsCommunityChestCard &&
    !currentPlayerState.needsSpecialSpaceAction &&
    !currentPlayerState.needsBankruptcyCheck &&
    (currentPlayerState.doublesCount === 0 ||
      // (currentPlayerState.lastDiceRoll[0] !==
      //   currentPlayerState.lastDiceRoll[1] ||
      currentPlayerState.inJail);

  const showPayJailFine =
    isCurrentTurn && !!currentPlayerState && currentPlayerState.inJail;
  // currentPlayerState.cashBalance >= JAIL_FINE; -> display on UI

  const showGetOutOfJailCard =
    isCurrentTurn &&
    !!currentPlayerState &&
    currentPlayerState.inJail &&
    currentPlayerState.getOutOfJailCards > 0;

  const getPropertyByPosition = useCallback(
    (position: number): PropertyAccount | null => {
      return properties.find((prop) => prop.position === position) || null;
    },
    [properties]
  );

  const getPlayerByAddress = useCallback(
    (address: Address): PlayerAccount | null => {
      return players.find((player) => player.wallet === address) || null;
    },
    [players]
  );

  const isCurrentPlayerTurn = useCallback((): boolean => {
    if (!gameState || !currentPlayerAddress || !wallet?.address) return false;
    return gameState.players[gameState.currentTurn] === wallet.address;
  }, [gameState, currentPlayerAddress, wallet]);

  const canRollDice = useCallback((): boolean => {
    if (!currentPlayerState || !isCurrentPlayerTurn()) return false;

    const hasPendingActions =
      currentPlayerState.needsPropertyAction ||
      currentPlayerState.needsChanceCard ||
      currentPlayerState.needsCommunityChestCard ||
      currentPlayerState.needsBankruptcyCheck ||
      currentPlayerState.needsSpecialSpaceAction;

    // Player can roll dice if they haven't rolled dice yet and are not in jail
    // FIXME Need test all cases
    return (
      (!hasPendingActions && !currentPlayerState.hasRolledDice) ||
      (currentPlayerState.hasRolledDice &&
        currentPlayerState.lastDiceRoll[0] ===
          currentPlayerState.lastDiceRoll[1] &&
        !currentPlayerState.inJail)
    );

    // return (
    //   (!currentPlayerState.hasRolledDice &&
    //     !currentPlayerState.inJail &&
    //     !hasPendingActions) ||
    //   (currentPlayerState.hasRolledDice &&
    //     currentPlayerState.lastDiceRoll[0] ===
    //       currentPlayerState.lastDiceRoll[1])
    // );
  }, [currentPlayerState, isCurrentPlayerTurn]);

  const canPlayerAct = useCallback((): boolean => {
    if (!currentPlayerState || !isCurrentPlayerTurn()) return false;

    // Player can act if they haven't rolled dice yet or need to handle actions
    return (
      !currentPlayerState.hasRolledDice ||
      currentPlayerState.needsPropertyAction ||
      currentPlayerState.needsChanceCard ||
      currentPlayerState.needsCommunityChestCard
      // ||
      // currentPlayerState.canEndTurn
    );
  }, [currentPlayerState, isCurrentPlayerTurn]);

  // Game action handlers
  const startGame = useCallback(async (): Promise<void> => {
    if (!gameAddress || !gameState || !wallet?.address || !wallet.delegated) {
      throw new Error("Game address or player signer not available");
    }
    if (gameState.players.length < 2) {
      throw new Error("Game must have at least 2 players");
    }

    try {
      const instruction = await sdk.startGameIx({
        rpc,
        gameAddress,
        players: gameState?.players.map(address) || [],
        authority: { address: address(wallet.address) } as TransactionSigner,
      });

      const signature = await buildAndSendTransactionWithPrivy(
        rpc,
        [instruction],
        wallet
      );

      console.log("[startGame] tx", signature);

      // Play game start sound
      playSound("game-start", SOUND_CONFIG.volumes.specialEvents);
    } catch (error) {
      console.error("Error starting game:", error);
      throw error;
    }
  }, [rpc, gameAddress, gameState, wallet]);

  const resetGame = useCallback(async (): Promise<void> => {
    if (!gameAddress || !gameState || !wallet?.address || !wallet.delegated) {
      throw new Error("Game address or player signer not available");
    }

    try {
      const instruction = await sdk.resetGameIx({
        rpc: erRpc,
        gameAddress,
        players: gameState?.players.map(address) || [],
        authority: { address: address(wallet.address) } as TransactionSigner,
      });

      const signature = await buildAndSendTransactionWithPrivy(
        erRpc,
        [instruction],
        wallet,
        [],
        "confirmed",
        true
      );

      console.log("[resetGame] tx", signature);
    } catch (error) {
      console.error("Error resetting game:", error);
      throw error;
    }
  }, [erRpc, gameAddress, gameState, wallet]);

  const closeGame = useCallback(async (): Promise<void> => {
    if (!gameAddress || !gameState || !wallet?.address || !wallet.delegated) {
      throw new Error("Game address or player signer not available");
    }

    try {
      const [undelegateIx, closeIx] = await sdk.closeGameIx({
        rpc: erRpc,
        gameAddress,
        players: gameState?.players.map(address) || [],
        authority: { address: address(wallet.address) } as TransactionSigner,
      });

      const signature = await buildAndSendTransactionWithPrivy(
        erRpc,
        [undelegateIx],
        wallet,
        [],
        "confirmed",
        true
      );

      console.log("[undelegateIx] tx", signature);

      await new Promise((resolve) => setTimeout(resolve, 3000));

      const signature1 = await buildAndSendTransactionWithPrivy(
        rpc,
        [closeIx],
        wallet
      );

      console.log("[closeIx] tx", signature1);
    } catch (error) {
      console.error("Error closing game:", error);
      throw error;
    }
  }, [erRpc, gameAddress, gameState, wallet]);

  const joinGame = useCallback(async (): Promise<void> => {
    if (!gameAddress || !wallet?.address || !wallet.delegated || !gameState) {
      throw new Error("Game address or player signer not available");
    }

    try {
      const { instructions } = await sdk.joinGameIx({
        rpc,
        gameAddress,
        player: { address: address(wallet.address) } as TransactionSigner,
      });

      const signature = await buildAndSendTransactionWithPrivy(
        rpc,
        instructions,
        wallet
      );

      console.log("[joinGame] tx", signature);

      // Play player join sound
      playSound("player-join", SOUND_CONFIG.volumes.buttonClick);
    } catch (error) {
      console.error("Error joining game:", error);
      throw error;
    }
  }, [rpc, gameAddress, wallet, gameState]);

  const leaveGame = useCallback(async (): Promise<void> => {
    if (!gameAddress || !wallet?.address || !wallet.delegated) {
      throw new Error("Game address or player signer not available");
    }

    try {
      const instructions = await sdk.leaveGameIx({
        rpc,
        gameAddress,
        player: { address: address(wallet.address) } as TransactionSigner,
      });

      const signature = await buildAndSendTransactionWithPrivy(
        rpc,
        instructions,
        wallet
      );

      console.log("[leaveGame] tx", signature);

      // Play player leave sound
      playSound("player-leave", SOUND_CONFIG.volumes.buttonClick);
    } catch (error) {
      console.error("Error leaving game:", error);
      throw error;
    }
  }, [rpc, gameAddress, wallet]);

  const cancelGame = useCallback(async (): Promise<void> => {
    if (!gameAddress || !wallet?.address || !wallet.delegated || !gameState) {
      throw new Error("Game address or player signer not available");
    }

    try {
      const instructions = await sdk.cancelGameIx({
        rpc,
        gameAddress,
        creator: { address: address(wallet.address) } as TransactionSigner,
        isFreeGame: gameState.entryFee === 0,
        players: gameState?.players.map(address) || [],
      });

      const signature = await buildAndSendTransactionWithPrivy(
        rpc,
        instructions,
        wallet
      );

      console.log("[cancelGame] tx", signature);

      // Play game cancel sound
      playSound("game-cancel", SOUND_CONFIG.volumes.specialEvents);
    } catch (error) {
      console.error("Error canceling game:", error);
      throw error;
    }
  }, [rpc, gameAddress, wallet, gameState]);

  const rollDice = useCallback(
    async (diceRoll?: number[]): Promise<void> => {
      if (!gameAddress || !wallet?.address || !wallet.delegated) {
        throw new Error("Game address or player signer not available");
      }

      try {
        const instruction = await sdk.rollDiceIx({
          gameAddress,
          player: { address: address(wallet.address) } as TransactionSigner,
          diceRoll: diceRoll as any,
          useVrf: USE_VRF,
        });

        const signature = await buildAndSendTransactionWithPrivy(
          erRpc,
          [instruction],
          wallet,
          [],
          "confirmed",
          true
        );

        console.log("[rollDice] tx", signature);
      } catch (error) {
        console.error("Error rolling dice:", error);
        throw error;
      }
    },
    [gameAddress, wallet]
  );

  const buyProperty = useCallback(
    async (position: number): Promise<void> => {
      if (!gameAddress || !wallet?.address || !wallet.delegated) {
        throw new Error("Game address or player signer not available");
      }

      try {
        const instruction = await sdk.buyPropertyIxV2({
          gameAddress,
          player: { address: address(wallet.address) } as TransactionSigner,
          position,
        });

        const signature = await buildAndSendTransactionWithPrivy(
          erRpc,
          [instruction],
          wallet,
          [],
          "confirmed",
          true
        );

        console.log("[buyProperty] tx", signature);

        // Play property buy sound
        playPropertySound("buy");

        soundUtil.playPropertySound("buy");
      } catch (error) {
        console.error("Error buying property:", error);
        throw error;
      }
    },
    [gameAddress, wallet]
  );

  const skipProperty = useCallback(
    async (position: number): Promise<void> => {
      if (!gameAddress || !wallet?.address || !wallet.delegated) {
        throw new Error("Game address or player signer not available");
      }

      try {
        const instruction = await sdk.declinePropertyIxV2({
          rpc,
          gameAddress,
          player: { address: address(wallet.address) } as TransactionSigner,
          position,
        });

        const signature = await buildAndSendTransactionWithPrivy(
          erRpc,
          [instruction],
          wallet,
          [],
          "confirmed",
          true
        );

        console.log("[skipProperty] tx", signature);
      } catch (error) {
        console.error("Error skipping property:", error);
        throw error;
      }
    },
    [gameAddress, wallet]
  );

  const payRent = useCallback(
    async (position: number, owner: string): Promise<void> => {
      if (!gameAddress || !wallet?.address || !wallet.delegated) {
        throw new Error("Game address or player signer not available");
      }

      try {
        const instruction = await sdk.payRentIxV2({
          rpc,
          gameAddress: gameAddress,
          player: { address: address(wallet.address) } as TransactionSigner,
          position: position,
          propertyOwner: address(owner),
        });

        const signature = await buildAndSendTransactionWithPrivy(
          erRpc,
          [instruction],
          wallet,
          [],
          "confirmed",
          true
        );

        console.log("[payRent] tx", signature);

        playPropertySound("rent");

        console.log("Rent paid:", signature);
      } catch (error) {
        console.error("Error paying rent:", error);
        throw error;
      }
    },
    [gameAddress, wallet]
  );

  const endTurn = useCallback(async (): Promise<void> => {
    if (!gameAddress || !wallet?.address || !wallet.delegated) {
      throw new Error("Game address or player signer not available");
    }

    try {
      const instruction = await sdk.endTurnIx({
        rpc,
        gameAddress,
        player: { address: address(wallet.address) } as TransactionSigner,
      });

      const signature = await buildAndSendTransactionWithPrivy(
        erRpc,
        [instruction],
        wallet,
        [],
        "confirmed",
        true
      );

      console.log("[endTurn] tx", signature);
    } catch (error) {
      console.error("Error ending turn:", error);
      throw error;
    }
  }, [gameAddress, wallet]);

  const drawChanceCard = useCallback(async (): Promise<void> => {
    if (!gameAddress || !wallet?.address || !wallet.delegated) {
      throw new Error("Game address or player signer not available");
    }

    try {
      const instruction = await sdk.drawChanceCardIx({
        gameAddress: gameAddress,
        player: { address: address(wallet.address) } as TransactionSigner,
        // index: 4,
        useVrf: USE_VRF,
      });

      const signature = await buildAndSendTransactionWithPrivy(
        erRpc,
        [instruction],
        wallet,
        [],
        "confirmed",
        true
      );

      console.log("[drawChanceCard] tx", signature);
    } catch (error) {
      console.error("Error drawing chance card:", error);
      throw error;
    }
  }, [gameAddress, wallet]);

  const drawCommunityChestCard = useCallback(async (): Promise<void> => {
    if (!gameAddress || !wallet?.address || !wallet.delegated) {
      throw new Error("Game address or player signer not available");
    }

    try {
      const instruction = await sdk.drawCommunityChestCardIx({
        gameAddress: gameAddress,
        player: { address: address(wallet.address) } as TransactionSigner,
        // index: 0,
        useVrf: USE_VRF,
      });

      const signature = await buildAndSendTransactionWithPrivy(
        erRpc,
        [instruction],
        wallet,
        [],
        "confirmed",
        true
      );

      console.log("[drawCommunityChestCard] tx", signature);

      console.log("Community Chest card drawn:", signature);
    } catch (error) {
      console.error("Error drawing community chest card:", error);
      throw error;
    }
  }, [gameAddress, wallet]);

  const payJailFine = useCallback(async (): Promise<void> => {
    if (!gameAddress || !wallet?.address || !wallet.delegated) {
      throw new Error("Game address or player signer not available");
    }

    try {
      const instruction = await sdk.payJailFineIx({
        gameAddress,
        player: { address: address(wallet.address) } as TransactionSigner,
      });

      const signature = await buildAndSendTransactionWithPrivy(
        erRpc,
        [instruction],
        wallet,
        [],
        "confirmed",
        true
      );

      console.log("[payJailFine] tx", signature);

      // Play money pay sound for jail fine
      playSound("money-pay", SOUND_CONFIG.volumes.moneyPay);
    } catch (error) {
      console.error("Error paying jail fine:", error);
      throw error;
    }
  }, [gameAddress, wallet]);
  const useGetOutOfJailCard = useCallback(async (): Promise<void> => {
    if (!gameAddress || !wallet?.address || !wallet.delegated) {
      throw new Error("Game address or player signer not available");
    }

    try {
      const instruction = await sdk.useGetOutOfJailCardIx({
        gameAddress,
        player: { address: address(wallet.address) } as TransactionSigner,
      });

      const signature = await buildAndSendTransactionWithPrivy(
        erRpc,
        [instruction],
        wallet,
        [],
        "confirmed",
        true
      );

      console.log("[useGetOutOfJailCard] tx", signature);
    } catch (error) {
      console.error("Error using get out of jail card:", error);
      throw error;
    }
  }, [gameAddress, wallet]);

  const buildHouse = useCallback(
    async (position: number): Promise<void> => {
      if (!gameAddress || !wallet?.address || !wallet.delegated) {
        throw new Error("Game address or player signer not available");
      }

      try {
        const instruction = await sdk.buildHouseIxV2({
          gameAddress,
          player: { address: address(wallet.address) } as TransactionSigner,
          position,
        });

        const signature = await buildAndSendTransactionWithPrivy(
          erRpc,
          [instruction],
          wallet,
          [],
          "confirmed",
          true
        );

        console.log("[buildHouse] tx", signature);

        // Play house build sound
        playSound("house-build", SOUND_CONFIG.volumes.propertyBuy);
      } catch (error) {
        console.error("Error building house:", error);
        throw error;
      }
    },
    [gameAddress, wallet]
  );

  const buildHotel = useCallback(
    async (position: number): Promise<void> => {
      if (!gameAddress || !wallet?.address || !wallet.delegated) {
        throw new Error("Game address or player signer not available");
      }

      try {
        const instruction = await sdk.buildHotelIxV2({
          gameAddress,
          player: { address: address(wallet.address) } as TransactionSigner,
          position,
        });

        const signature = await buildAndSendTransactionWithPrivy(
          erRpc,
          [instruction],
          wallet,
          [],
          "confirmed",
          true
        );

        console.log("[buildHotel] tx", signature);

        // Play hotel build sound
        playSound("hotel-build", SOUND_CONFIG.volumes.propertyBuy);
      } catch (error) {
        console.error("Error building hotel:", error);
        throw error;
      }
    },
    [gameAddress, wallet]
  );

  const sellBuilding = useCallback(
    async (position: number, buildingType: BuildingType): Promise<void> => {
      if (!gameAddress || !wallet?.address || !wallet.delegated) {
        throw new Error("Game address or player signer not available");
      }

      try {
        const instruction = await sdk.sellBuildingIxV2({
          rpc,
          gameAddress,
          player: { address: address(wallet.address) } as TransactionSigner,
          position,
          buildingType,
        });

        const signature = await buildAndSendTransactionWithPrivy(
          erRpc,
          [instruction],
          wallet,
          [],
          "confirmed",
          true
        );

        console.log("[sellBuilding] tx", signature);

        // Play building sell sound when selling building
        playSound("building-sell", SOUND_CONFIG.volumes.moneyReceive);
      } catch (error) {
        console.error(`Error selling ${buildingType}:`, error);
        throw error;
      }
    },
    [gameAddress, wallet]
  );

  const payMevTax = useCallback(async (): Promise<void> => {
    if (!gameAddress || !wallet?.address || !wallet.delegated) {
      throw new Error("Game address or player signer not available");
    }

    try {
      const instruction = await sdk.payMevTaxIx({
        gameAddress,
        player: { address: address(wallet.address) } as TransactionSigner,
      });

      const signature = await buildAndSendTransactionWithPrivy(
        erRpc,
        [instruction],
        wallet,
        [],
        "confirmed",
        true
      );

      console.log("[payMevTax] tx", signature);

      // Play money pay sound for MEV tax
      playSound("money-pay", SOUND_CONFIG.volumes.moneyPay);
    } catch (error) {
      console.error("Error paying MEV tax:", error);
      throw error;
    }
  }, [gameAddress, wallet]);

  const payPriorityFeeTax = useCallback(async (): Promise<void> => {
    if (!gameAddress || !wallet?.address || !wallet.delegated) {
      throw new Error("Game address or player signer not available");
    }

    try {
      const instruction = await sdk.payPriorityFeeTaxIx({
        rpc,
        gameAddress,
        player: { address: address(wallet.address) } as TransactionSigner,
      });

      const signature = await buildAndSendTransactionWithPrivy(
        erRpc,
        [instruction],
        wallet,
        [],
        "confirmed",
        true
      );

      console.log("[payPriorityFeeTax] tx", signature);

      // Play money pay sound for priority fee tax
      playSound("money-pay", SOUND_CONFIG.volumes.moneyPay);
    } catch (error) {
      console.error("Error paying Priority Fee tax:", error);
      throw error;
    }
  }, [gameAddress, wallet]);

  const createTrade = useCallback(
    async (
      receiver: string,
      initiatorOffer: TradeOffer,
      targetOffer: TradeOffer
    ): Promise<void> => {
      if (!gameAddress || !wallet?.address || !wallet.delegated) {
        throw new Error("Game address or player signer not available");
      }

      try {
        const proposerMoney = parseInt(initiatorOffer.money) || 0;
        const receiverMoney = parseInt(targetOffer.money) || 0;

        const proposerProperty = initiatorOffer.property;
        const receiverProperty = targetOffer.property;

        let tradeType: TradeType;
        if (proposerProperty !== null && receiverProperty !== null) {
          tradeType = TradeType.PropertyOnly;
        } else if (proposerProperty !== null && receiverMoney > 0) {
          tradeType = TradeType.PropertyForMoney;
        } else if (proposerMoney > 0 && receiverProperty !== null) {
          tradeType = TradeType.MoneyForProperty;
        } else {
          tradeType = TradeType.MoneyOnly;
        }

        const instruction = await sdk.createTradeIx({
          gameAddress,
          proposer: { address: address(wallet.address) } as TransactionSigner,
          receiver: address(receiver),
          tradeType,
          proposerMoney,
          receiverMoney,
          proposerProperty: proposerProperty ?? undefined,
          receiverProperty: receiverProperty ?? undefined,
        });

        const signature = await buildAndSendTransactionWithPrivy(
          erRpc,
          [instruction],
          wallet,
          [],
          "confirmed",
          true
        );

        console.log("[createTrade] tx", signature);

        // Play button click sound for creating trade
        playSound("button-click", SOUND_CONFIG.volumes.buttonClick);
      } catch (error) {
        console.error("Error creating trade:", error);
        toast.error("Failed to create trade");
        throw error;
      }
    },
    [gameAddress, wallet, erRpc]
  );

  const acceptTrade = useCallback(
    async (tradeId: string, proposer: string): Promise<void> => {
      if (!gameAddress || !wallet?.address || !wallet.delegated) {
        throw new Error("Game address or player signer not available");
      }

      try {
        const instruction = await sdk.acceptTradeIx({
          gameAddress,
          accepter: { address: address(wallet.address) } as TransactionSigner,
          proposer: address(proposer),
          tradeId: parseInt(tradeId), // Convert string to number for SDK
        });

        const signature = await buildAndSendTransactionWithPrivy(
          erRpc,
          [instruction],
          wallet,
          [],
          "confirmed",
          true
        );

        console.log("[acceptTrade] tx", signature);

        // Play money receive sound for successful trade
        playSound("money-receive", SOUND_CONFIG.volumes.moneyReceive);
      } catch (error) {
        console.error("Error accepting trade:", error);
        toast.error("Failed to accept trade");
        throw error;
      }
    },
    [gameAddress, wallet, erRpc]
  );

  const rejectTrade = useCallback(
    async (tradeId: string): Promise<void> => {
      if (!gameAddress || !wallet?.address || !wallet.delegated) {
        throw new Error("Game address or player signer not available");
      }

      try {
        console.log("tradeId", tradeId);
        const instruction = await sdk.rejectTradeIx({
          gameAddress,
          rejecter: { address: address(wallet.address) } as TransactionSigner,
          tradeId: parseInt(tradeId),
        });

        const signature = await buildAndSendTransactionWithPrivy(
          erRpc,
          [instruction],
          wallet,
          [],
          "confirmed",
          true
        );

        console.log("[rejectTrade] tx", signature);

        // Play button click sound for rejecting trade
        playSound("button-click2", SOUND_CONFIG.volumes.buttonClick);
      } catch (error) {
        console.error("Error rejecting trade:", error);
        toast.error("Failed to reject trade");
        throw error;
      }
    },
    [gameAddress, wallet, erRpc]
  );

  const cancelTrade = useCallback(
    async (tradeId: string): Promise<void> => {
      if (!gameAddress || !wallet?.address || !wallet.delegated) {
        throw new Error("Game address or player signer not available");
      }

      try {
        const instruction = await sdk.cancelTradeIx({
          gameAddress,
          canceller: { address: address(wallet.address) } as TransactionSigner,
          tradeId: parseInt(tradeId), // Convert string to number for SDK
        });

        const signature = await buildAndSendTransactionWithPrivy(
          erRpc,
          [instruction],
          wallet,
          [],
          "confirmed",
          true
        );

        console.log("[cancelTrade] tx", signature);

        // Play button click sound for canceling trade
        playSound("button-click2", SOUND_CONFIG.volumes.buttonClick);
      } catch (error) {
        console.error("Error canceling trade:", error);
        toast.error("Failed to cancel trade");
        throw error;
      }
    },
    [gameAddress, wallet, erRpc]
  );

  const declareBankruptcy = useCallback(async (): Promise<void> => {
    if (
      !gameAddress ||
      !currentPlayerState ||
      !wallet?.address ||
      !wallet.delegated
    ) {
      throw new Error("Game address or player signer not available");
    }

    try {
      const instruction = await sdk.declareBankruptcyIx({
        gameAddress,
        player: { address: address(wallet.address) } as TransactionSigner,
        propertiesOwned: Array.from(currentPlayerState.propertiesOwned),
      });

      const signature = await buildAndSendTransactionWithPrivy(
        erRpc,
        [instruction],
        wallet,
        [],
        "confirmed",
        true
      );

      console.log("[declareBankruptcy] tx", signature);

      // Play lose sound for bankruptcy
      playSound(
        "lose",
        SOUND_CONFIG.volumes.lose,
        SOUND_CONFIG.durations.loseSound
      );
    } catch (error) {
      console.error("Error declaring bankruptcy:", error);
      throw error;
    }
  }, [gameAddress, currentPlayerState, wallet]);

  const endGame = useCallback(async (): Promise<void> => {
    if (
      !gameAddress ||
      !gameState ||
      !currentPlayerState ||
      !wallet?.address ||
      !wallet.delegated
    ) {
      throw new Error("Game address or player signer not available");
    }

    try {
      const instruction = await sdk.endGameIx({
        gameAddress,
        caller: { address: address(wallet.address) } as TransactionSigner,
        players: gameState.players.map(address),
      });

      const signature = await buildAndSendTransactionWithPrivy(
        erRpc,
        [instruction],
        wallet,
        [],
        "confirmed",
        true
      );

      console.log("[endGame] tx", signature);
    } catch (error) {
      console.error("Error ending game:", error);
      throw error;
    }
  }, [gameAddress, currentPlayerState, gameState, wallet]);

  const claimReward = useCallback(async (): Promise<void> => {
    if (!gameAddress || !wallet?.address || !wallet.delegated) {
      throw new Error("Game address or player signer not available");
    }

    try {
      const instruction = await sdk.claimRewardIx({
        gameAddress,
        winner: { address: address(wallet.address) } as TransactionSigner,
      });

      const signature = await buildAndSendTransactionWithPrivy(
        rpc,
        [instruction],
        wallet
      );

      console.log("[claimReward] tx", signature);

      // Play win sound for claiming reward
      playSound(
        "win",
        SOUND_CONFIG.volumes.win,
        SOUND_CONFIG.durations.winSound
      );
    } catch (error) {
      console.error("Error claiming reward:", error);
      throw error;
    }
  }, [gameAddress, currentPlayerState, wallet]);

  useEffect(() => {
    if (currentPlayerState) {
      if (!currentPlayerState.needsChanceCard) {
        setHasShownChanceModal(false);
      }
      if (!currentPlayerState.needsCommunityChestCard) {
        setHasShownCommunityChestModal(false);
      }
    }
  }, [
    currentPlayerState?.needsChanceCard,
    currentPlayerState?.needsCommunityChestCard,
  ]);

  useEffect(() => {
    async function handleAction(player: PlayerAccount) {
      console.log("Auto-handling player action for player:", player.wallet);

      // Priority 1: Handle bankruptcy check first (most critical)
      if (player.needsBankruptcyCheck) {
        console.log("Player needs bankruptcy check");
        return;
      }

      // Priority 2: Handle jail-related actions
      // if (player.inJail && player.jailTurns > 0) {
      //   console.log("Player is in jail");
      //   // Don't auto-handle jail - let player choose to pay fine or roll dice
      //   // This is handled by the ActionPanel component
      //   return;
      // }

      // Priority 3: Handle dice rolling (if player hasn't rolled yet)
      // if (!player.hasRolledDice && !player.inJail) {
      //   console.log("Player needs to roll dice");
      //   // Don't auto-roll - let player click the dice button
      //   // This is handled by the ActionPanel component
      //   return;
      // }

      // Priority 4: Handle property actions (after landing on a property)
      if (player.needsPropertyAction && player.pendingPropertyPosition) {
        const pendingPropertyPosition = player.pendingPropertyPosition;

        const property = properties.find(
          (prop) => prop.position === pendingPropertyPosition
        );

        if (!property) {
          console.error(
            "Property not found at position:",
            pendingPropertyPosition
          );
          return;
        }

        // If property is owned by another player, auto-pay rent
        if (!!property.owner && property.owner !== player.wallet) {
          console.log("Auto-paying rent to property owner");
          try {
            await payRent(pendingPropertyPosition, property.owner);

            const ownerPlayer = getPlayerByAddress(property.owner as Address);
            if (ownerPlayer) {
              // const rentAmount = calculateRentForProperty(
              //   property,
              //   ownerPlayer,
              //   player.lastDiceRoll as [number, number],
              //   properties
              // );
              // const propertyData = getBoardSpaceData(property.position);
              // const propertyName = propertyData?.name || "Property";
              // showRentPaymentToast({
              //   rentAmount,
              //   ownerAddress: property.owner,
              //   propertyName,
              // });
            } else {
              // Fallback toast if owner player data is not available
              // const propertyData = getBoardSpaceData(property.position);
              // showRentPaymentFallbackToast({
              //   ownerAddress: property.owner,
              //   propertyName: propertyData?.name || "Property",
              // });
            }
          } catch (error) {
            console.error("Error auto-paying rent:", error);
            showRentPaymentErrorToast();
          }
          return;
        }

        // If property is unowned, show buy dialog
        if (!!property.owner) {
          console.log("Showing buy property dialog");
          setSelectedProperty(pendingPropertyPosition);
          setIsPropertyDialogOpen(true);
          return;
        }

        // If property is owned by current player, check for building opportunities
        if (!!property.owner && property.owner === player.wallet) {
          console.log(
            "Player owns this property - checking for building opportunities"
          );
          // TODO: Check if player has monopoly and can build
          // For now, just clear the pending action
          return;
        }
      }

      // Priority 5: Handle special space actions
      // const position = player.position;

      // if (position === 0) {
      //   console.log("Player landed on MEV Tax space");
      //   try {
      //     await payMevTax();
      //   } catch (error) {
      //     console.error("Failed to pay MEV tax:", error);
      //   }
      //   return;
      // }

      // if (position === 0) {
      //   console.log("Player landed on Priority Fee Tax space");
      //   try {
      //     await payPriorityFeeTax();
      //   } catch (error) {
      //     console.error("Failed to pay Priority Fee tax:", error);
      //   }
      //   return;
      // }

      // if (
      //   player.needsSpecialSpaceAction &&
      //   isSome(player.pendingSpecialSpacePosition)
      // ) {
      //   const specialPosition = player.pendingSpecialSpacePosition.value;
      //   console.log(
      //     "Player needs special space action at position:",
      //     specialPosition
      //   );

      //   // Handle specific special spaces
      //   if (specialPosition === MEV_TAX_POSITION) {
      //     console.log("Player landed on MEV Tax space");
      //     try {
      //       await payMevTax();
      //     } catch (error) {
      //       console.error("Failed to pay MEV tax:", error);
      //       // addGameLog({
      //       //   type: "move",
      //       //   playerId: player.wallet,
      //       //   message: `${getPlayerName(player.wallet)} failed to pay MEV tax`,
      //       //   details: { position: specialPosition, error: error.message },
      //       // });
      //     }
      //     return;
      //   }

      //   if (specialPosition === PRIORITY_FEE_TAX_POSITION) {
      //     console.log("Player landed on Priority Fee Tax space");
      //     try {
      //       await payPriorityFeeTax();
      //     } catch (error) {
      //       console.error("Failed to pay Priority Fee tax:", error);
      //       // addGameLog({
      //       //   type: "move",
      //       //   playerId: player.wallet,
      //       //   message: `${getPlayerName(player.wallet)} failed to pay Priority Fee tax`,
      //       //   details: { position: specialPosition, error: error.message },
      //       // });
      //     }
      //     return;
      //   }

      //   // For other special spaces (FREE_PARKING, etc.)
      //   addGameLog({
      //     type: "move",
      //     playerId: player.wallet,
      //     message: `${getPlayerName(player.wallet)} landed on a special space`,
      //     details: { position: specialPosition },
      //   });
      //   return;
      // }

      // Priority 6: Handle card drawing
      if (
        player.needsChanceCard &&
        !isCardDrawModalOpen &&
        !hasShownChanceModal
      ) {
        setHasShownChanceModal(true);
        setTimeout(() => {
          console.log("Player needs to draw Chance card");
          setCardDrawType("chance");
          setIsCardDrawModalOpen(true);
        }, 300);
        return;
      }

      if (
        player.needsCommunityChestCard &&
        !isCardDrawModalOpen &&
        !hasShownCommunityChestModal
      ) {
        setHasShownCommunityChestModal(true);
        setTimeout(() => {
          console.log("Player needs to draw Community Chest card");
          setCardDrawType("community-chest");
          setIsCardDrawModalOpen(true);
        }, 300);
        return;
      }

      // Priority 7: Check if player can end turn
      // if (player.canEndTurn) {
      //   console.log("Player can end turn");
      //   // Don't auto-end turn - let player click the end turn button
      //   // This gives them time to review their situation and make decisions
      //   return;
      // }

      // Priority 8: Handle doubles (if player rolled doubles and can roll again)
      if (
        player.doublesCount > 0 &&
        player.doublesCount < 3 &&
        player.hasRolledDice
      ) {
        console.log("Player rolled doubles and can roll again");
        // Reset hasRolledDice flag so they can roll again
        // This should be handled by the smart contract, but we can show UI feedback
        return;
      }
    }

    if (gameAddress && currentPlayerState && signer && isCurrentPlayerTurn()) {
      handleAction(currentPlayerState);
    }
  }, [
    currentPlayerState,
    gameAddress,
    signer,
    properties,
    payRent,
    isCurrentPlayerTurn,
    isCardDrawModalOpen,
    hasShownChanceModal,
    hasShownCommunityChestModal,
  ]);

  const value: GameContextType = {
    // Game identification
    gameAddress,
    setGameAddress,

    // Current player management
    currentPlayerAddress,
    currentPlayerState,
    signer,

    // Game data
    gameState: gameState || null,
    players: players || [],
    properties: properties || [],
    gameLoading,
    gameError,
    refetch,

    // Game actions
    startGame,
    resetGame,
    closeGame,
    joinGame,
    leaveGame,
    cancelGame,
    rollDice,
    buyProperty,
    skipProperty,
    payRent,
    endTurn,
    drawChanceCard,
    drawCommunityChestCard,
    payJailFine,
    useGetOutOfJailCard,
    buildHouse,
    buildHotel,
    sellBuilding,
    payMevTax,
    payPriorityFeeTax,
    declareBankruptcy,
    endGame,
    claimReward,

    // Trade actions
    createTrade,
    acceptTrade,
    rejectTrade,
    cancelTrade,

    // UI state management
    selectedProperty,
    setSelectedProperty,
    isPropertyDialogOpen,
    setIsPropertyDialogOpen,
    isCardDrawModalOpen,
    setIsCardDrawModalOpen,
    cardDrawType,
    setCardDrawType,

    // ui
    isCurrentTurn,
    showRollDice,
    showEndTurn,
    showPayJailFine,
    showGetOutOfJailCard,

    // Utility functions
    getPropertyByPosition,
    getPlayerByAddress,
    isCurrentPlayerTurn,
    canRollDice,
    canPlayerAct,
    // demo
    demoDices,
    setDemoDices,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};