"use client";

import { useEffect } from 'react';
import { playGameStateSound, playPropertySound, playSound, SOUND_CONFIG } from '@/lib/soundUtil';

export const useGameSounds = (gameState: any, previousGameState: any) => {
  useEffect(() => {
    if (!gameState || !previousGameState) return;

    // Detect game state changes and play appropriate sounds
    
    // Player moved to a new position
    if (gameState.currentPlayer?.position !== previousGameState.currentPlayer?.position) {
      // Small movement sound
      setTimeout(() => playSound("button-click", SOUND_CONFIG.volumes.buttonClick), SOUND_CONFIG.delays.movementFeedback);
    }

    // Player went to jail
    if (gameState.currentPlayer?.inJail && !previousGameState.currentPlayer?.inJail) {
      playGameStateSound('jail');
    }

    // Player got out of jail
    if (!gameState.currentPlayer?.inJail && previousGameState.currentPlayer?.inJail) {
      playSound("anime-wow", SOUND_CONFIG.volumes.specialEvents);
    }

    // Property was bought
    if (gameState.properties && previousGameState.properties) {
      const currentOwnedCount = Object.values(gameState.properties).filter((p: any) => p.owner).length;
      const previousOwnedCount = Object.values(previousGameState.properties).filter((p: any) => p.owner).length;
      
      if (currentOwnedCount > previousOwnedCount) {
        // Property was purchased
        setTimeout(() => playPropertySound('buy'), SOUND_CONFIG.delays.propertyBuyFeedback);
      }
    }

    // Player's money changed (rent payment, receiving money, etc.)
    if (gameState.currentPlayer?.money !== previousGameState.currentPlayer?.money) {
      const moneyDiff = gameState.currentPlayer.money - previousGameState.currentPlayer.money;
      
      if (moneyDiff > 0) {
        // Player received money
        setTimeout(() => playSound("money-receive", SOUND_CONFIG.volumes.moneyReceive), SOUND_CONFIG.delays.moneyChangeFeedback);
      } else if (moneyDiff < 0) {
        // Player paid money
        setTimeout(() => playSound("money-pay", SOUND_CONFIG.volumes.moneyPay), SOUND_CONFIG.delays.moneyChangeFeedback);
      }
    }

    // Game ended
    if (gameState.winner && !previousGameState.winner) {
      // Game has a winner
      if (gameState.winner === gameState.currentPlayer?.id) {
        playGameStateSound('win');
      } else {
        playGameStateSound('lose');
      }
    }

    // Special space events
    if (gameState.currentAction && gameState.currentAction !== previousGameState.currentAction) {
      const action = gameState.currentAction;
      
      if (action.type === 'draw_chance' || action.type === 'draw_community_chest') {
        setTimeout(() => playSound("anime-wow", SOUND_CONFIG.volumes.specialEvents), SOUND_CONFIG.delays.specialEventFeedback);
      }
      
      if (action.type === 'pay_tax') {
        setTimeout(() => playSound("money-pay", SOUND_CONFIG.volumes.moneyPay), SOUND_CONFIG.delays.taxPaymentFeedback);
      }
    }

  }, [gameState, previousGameState]);
};

export default useGameSounds;