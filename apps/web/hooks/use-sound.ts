"use client";

import { useCallback } from "react";
import { playSound, SOUND_CONFIG } from "@/lib/soundUtil";

export function useSound() {
  const playButtonClick = useCallback(() => {
    playSound("button-click", SOUND_CONFIG.volumes.buttonClick);
  }, []);

  const playButtonHover = useCallback(() => {
    playSound("button-hover", SOUND_CONFIG.volumes.buttonHover);
  }, []);

  const playMoneyReceive = useCallback(() => {
    playSound("money-receive", SOUND_CONFIG.volumes.moneyReceive);
  }, []);

  const playMoneyPay = useCallback(() => {
    playSound("money-pay", SOUND_CONFIG.volumes.moneyPay);
  }, []);

  const playPropertyBuy = useCallback(() => {
    playSound("property-buy", SOUND_CONFIG.volumes.propertyBuy);
  }, []);

  const playRentPay = useCallback(() => {
    playSound("rent-pay", SOUND_CONFIG.volumes.moneyPay);
  }, []);

  const playHouseBuild = useCallback(() => {
    playSound("house-build", SOUND_CONFIG.volumes.propertyBuy);
  }, []);

  const playHotelBuild = useCallback(() => {
    playSound("hotel-build", SOUND_CONFIG.volumes.propertyBuy);
  }, []);

  const playDiceRoll = useCallback(() => {
    playSound("dice-short", SOUND_CONFIG.volumes.diceRoll);
  }, []);

  const playDiceLand = useCallback(() => {
    playSound("dice-land", SOUND_CONFIG.volumes.diceLand);
  }, []);

  return {
    playButtonClick,
    playButtonHover,
    playMoneyReceive,
    playMoneyPay,
    playPropertyBuy,
    playRentPay,
    playHouseBuild,
    playHotelBuild,
    playDiceRoll,
    playDiceLand,
    playSound, // Generic sound player
  };
}
