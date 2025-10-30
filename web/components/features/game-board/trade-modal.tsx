"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import { useGameContext } from "@/components/providers/game-provider";
import { useWallet } from "@/hooks/use-wallet";
import { formatAddress } from "@/lib/utils";
import { getTypedSpaceData } from "@/lib/board-utils";
import { colorMap, ColorGroup } from "@/configs/board-data";
import { PropertyAccount, TradeOffer } from "@/types/schema";

type TradeType =
  | "money-money"
  | "money-property"
  | "property-money"
  | "property-property";

interface CreateTradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MoneySelectionProps {
  label: string;
  value: number;
  maxValue: number;
  onChange: (value: number) => void;
  id: string;
  disabled?: boolean;
}

function MoneySelection({
  label,
  value,
  maxValue,
  onChange,
  id,
  disabled = false,
}: MoneySelectionProps) {
  if (maxValue <= 0) {
    return (
      <div className="space-y-3 p-4 border-2 border-red-500 bg-red-50 dark:bg-red-950">
        <Label className="text-sm font-black text-red-700 dark:text-red-300 uppercase">{label}</Label>
        <p className="text-sm font-bold text-red-600 dark:text-red-400">
          ✗ NO CASH AVAILABLE (${maxValue})
        </p>
      </div>
    );
  }

  const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;

  return (
    <div className="space-y-3 p-4 border-3 border-black dark:border-white bg-white dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-base font-black uppercase">
          {label}
        </Label>
        <span className="text-3xl font-black text-black dark:text-white">${value}</span>
      </div>
      <div className="px-2">
        <input
          type="range"
          id={id}
          min={0}
          max={maxValue}
          step={10}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          disabled={disabled}
          className="w-full h-4 bg-gray-200 border-3 border-black rounded-none appearance-none cursor-pointer trade-slider"
          style={{
            background: `linear-gradient(to right, #10b981 ${percentage}%, #e5e7eb ${percentage}%)`,
          }}
        />
      </div>
      <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-400 uppercase">
        <span>$0</span>
        <span>${maxValue}</span>
      </div>

      <style jsx>{`
        .trade-slider::-webkit-slider-thumb {
          appearance: none;
          height: 24px;
          width: 24px;
          border-radius: 0;
          background: black;
          cursor: pointer;
          border: 3px solid white;
          box-shadow: 3px 3px 0px 0px rgba(0, 0, 0, 0.8);
        }

        .trade-slider::-moz-range-thumb {
          height: 24px;
          width: 24px;
          border-radius: 0;
          background: black;
          cursor: pointer;
          border: 3px solid white;
          box-shadow: 3px 3px 0px 0px rgba(0, 0, 0, 0.8);
        }

        .trade-slider::-webkit-slider-thumb:hover {
          transform: scale(1.1);
        }

        .trade-slider::-webkit-slider-thumb:active {
          transform: scale(0.95);
          box-shadow: none;
        }

        .trade-slider:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

interface PropertySelectionProps {
  label: string;
  value: string;
  properties: PropertyAccount[];
  onChange: (value: string) => void;
  id: string;
  placeholder?: string;
  disabled?: boolean;
}

function PropertySelection({
  label,
  value,
  properties,
  onChange,
  id,
  placeholder = "Select property",
  disabled = false,
}: PropertySelectionProps) {
  if (properties.length === 0) {
    return (
      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">{label}</Label>
        <p className="text-sm text-muted-foreground">No properties available</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm mb-2">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="bg-background">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {properties.map((property) => {
            const space = getTypedSpaceData(property.position, "property");
            const color = colorMap[space?.colorGroup as ColorGroup] || "";
            return (
              <SelectItem
                key={property.address}
                value={property.position.toString()}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <div
                    className="w-3 h-3 rounded shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate inline-block">{space?.name}</span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

export function CreateTradeDialog({
  open,
  onOpenChange,
}: CreateTradeDialogProps) {
  const { players, properties, createTrade } = useGameContext();
  const { wallet } = useWallet();

  const [isRequesting, setIsRequesting] = useState(false);
  const [selectedPlayerAddress, setSelectedPlayerAddress] =
    useState<string>("");
  const [tradeType, setTradeType] = useState<TradeType>("money-money");
  const [offerMoney, setOfferMoney] = useState(0);
  const [offerProperty, setOfferProperty] = useState("");
  const [requestMoney, setRequestMoney] = useState(0);
  const [requestProperty, setRequestProperty] = useState("");

  // Filter out current player from available players
  const currentPlayerState = players.find(
    (player) => player.wallet === wallet?.address
  );

  const availablePlayers = players.filter(
    (player) => player.wallet !== wallet?.address
  );

  const currentPlayerProperties = properties.filter(
    (property) => property.owner === wallet?.address
  );

  const selectedPlayer = availablePlayers.find(
    (player) => player.wallet === selectedPlayerAddress
  );

  const selectedPlayerProperties = properties.filter(
    (property) => property.owner === selectedPlayerAddress
  );

  const currentPlayerMoney = Number(currentPlayerState?.cashBalance || 0);
  const selectedPlayerMoney = Number(selectedPlayer?.cashBalance || 0);

  const availableTradeTypes = useMemo(() => {
    const types = [];

    // Money for Money - both players need money
    if (currentPlayerMoney > 0 && selectedPlayerMoney > 0) {
      types.push("money-money");
    }

    // Money for Property - current player needs money, selected player needs properties
    if (currentPlayerMoney > 0 && selectedPlayerProperties.length > 0) {
      types.push("money-property");
    }

    // Property for Money - current player needs properties, selected player needs money
    if (currentPlayerProperties.length > 0 && selectedPlayerMoney > 0) {
      types.push("property-money");
    }

    // Property for Property - both players need properties
    if (
      currentPlayerProperties.length > 0 &&
      selectedPlayerProperties.length > 0
    ) {
      types.push("property-property");
    }

    return types;
  }, [
    currentPlayerMoney,
    selectedPlayerMoney,
    currentPlayerProperties.length,
    selectedPlayerProperties.length,
  ]);

  // Auto-select first available trade type when player is selected
  const handlePlayerSelection = (playerAddress: string) => {
    setSelectedPlayerAddress(playerAddress);
    setOfferMoney(0);
    setOfferProperty("");
    setRequestMoney(0);
    setRequestProperty("");

    // Auto-select first available trade type
    if (availableTradeTypes.length > 0) {
      setTradeType(availableTradeTypes[0] as TradeType);
    }
  };

  const handleCreateTrade = async () => {
    if (!selectedPlayerAddress || !currentPlayerState) return;

    // Create trade offers based on trade type
    const initiatorOffer: TradeOffer = {
      money: "0",
      property: null,
    };

    const targetOffer: TradeOffer = {
      money: "0",
      property: null,
    };

    if (tradeType === "money-money" || tradeType === "money-property") {
      initiatorOffer.money = offerMoney.toString();
    }
    if (tradeType === "property-money" || tradeType === "property-property") {
      initiatorOffer.property = offerProperty ? parseInt(offerProperty) : null;
    }

    if (tradeType === "money-money" || tradeType === "property-money") {
      targetOffer.money = requestMoney.toString();
    }
    if (tradeType === "money-property" || tradeType === "property-property") {
      targetOffer.property = requestProperty ? parseInt(requestProperty) : null;
    }

    try {
      setIsRequesting(true);
      await createTrade(selectedPlayerAddress, initiatorOffer, targetOffer);
      onOpenChange(false);
      // Reset form
      setSelectedPlayerAddress("");
      setTradeType("money-money");
      setOfferMoney(0);
      setOfferProperty("");
      setRequestMoney(0);
      setRequestProperty("");
    } catch (error) {
      console.error("Failed to create trade:", error);
    } finally {
      setIsRequesting(false);
    }
  };

  const isFormValid = () => {
    if (!selectedPlayerAddress || availableTradeTypes.length === 0)
      return false;

    switch (tradeType) {
      case "money-money":
        return offerMoney > 0 && requestMoney > 0;
      case "money-property":
        return offerMoney > 0 && requestProperty;
      case "property-money":
        return offerProperty && requestMoney > 0;
      case "property-property":
        return offerProperty && requestProperty;
      default:
        return false;
    }
  };

  const getTradeTypeDisabledReason = (type: TradeType): string | null => {
    switch (type) {
      case "money-money":
        if (currentPlayerMoney <= 0) return "You have no money to offer";
        if (selectedPlayerMoney <= 0) return "Selected player has no money";
        return null;
      case "money-property":
        if (currentPlayerMoney <= 0) return "You have no money to offer";
        if (selectedPlayerProperties.length === 0)
          return "Selected player has no properties";
        return null;
      case "property-money":
        if (currentPlayerProperties.length === 0)
          return "You have no properties to offer";
        if (selectedPlayerMoney <= 0) return "Selected player has no money";
        return null;
      case "property-property":
        if (currentPlayerProperties.length === 0)
          return "You have no properties to offer";
        if (selectedPlayerProperties.length === 0)
          return "Selected player has no properties";
        return null;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-[90vw] md:max-w-2xl lg:max-w-3xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-950 border-4 border-black dark:border-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] sm:shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
        <DialogHeader className="pb-3 sm:pb-4 border-b-4 border-black dark:border-white">
          <DialogTitle className="text-2xl sm:text-3xl font-black tracking-tighter">TRADE</DialogTitle>
          <DialogDescription className="text-sm sm:text-base font-semibold text-black dark:text-white">
            Select opponent and negotiate your terms
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6 md:space-y-8 py-3 sm:py-4 md:py-6">
          {/* Player Selection */}
          <div className="space-y-2 sm:space-y-3">
            <Label htmlFor="player" className="text-base sm:text-lg md:text-xl font-black uppercase tracking-wider">Who Trade With?</Label>
            <Select
              value={selectedPlayerAddress}
              onValueChange={handlePlayerSelection}
            >
              <SelectTrigger id="player" className="h-12 bg-white dark:bg-slate-900 border-3 border-black dark:border-white text-base font-bold">
                <SelectValue placeholder="SELECT PLAYER" />
              </SelectTrigger>
              <SelectContent className="border-4 border-black dark:border-white bg-white dark:bg-slate-900">
                {availablePlayers.map((player) => (
                  <SelectItem key={player.address} value={player.wallet} className="text-base font-bold">
                    <div className="flex items-center gap-2">
                      <Avatar className="size-6 rounded-full overflow-hidden border-2 border-black dark:border-white">
                        <AvatarImage
                          walletAddress={player.wallet}
                          alt={`Player ${player.address}`}
                        />
                        <AvatarFallback
                          walletAddress={player.wallet}
                          className="text-white font-black bg-black dark:bg-white dark:text-black text-sm"
                        >
                          {wallet?.address === player.wallet
                            ? "YOU"
                            : formatAddress(player.address).substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-bold">{formatAddress(player.address)}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Trade Type Selection */}
          <div className="space-y-3 sm:space-y-4">
            <Label className="text-base sm:text-lg md:text-xl font-black uppercase tracking-wider">Trade Type</Label>
            <RadioGroup
              value={tradeType}
              onValueChange={(value) => setTradeType(value as TradeType)}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    value: "money-money",
                    title: "CASH ↔ CASH",
                    desc: "Exchange money",
                  },
                  {
                    value: "money-property",
                    title: "CASH ↔ PROPERTY",
                    desc: "Cash for property",
                  },
                  {
                    value: "property-money",
                    title: "PROPERTY ↔ CASH",
                    desc: "Property for cash",
                  },
                  {
                    value: "property-property",
                    title: "PROPERTY ↔ PROPERTY",
                    desc: "Exchange properties",
                  },
                ].map((option) => {
                  const isDisabled = !availableTradeTypes.includes(
                    option.value
                  );
                  const disabledReason = getTradeTypeDisabledReason(
                    option.value as TradeType
                  );

                  return (
                    <Card
                      key={option.value}
                      className={`border-3 transition-all cursor-pointer ${isDisabled
                        ? "opacity-40 cursor-not-allowed bg-slate-200 dark:bg-slate-800 border-slate-400 dark:border-slate-600"
                        : tradeType === option.value
                          ? "bg-black dark:bg-white border-black dark:border-white shadow-lg scale-105"
                          : "border-black dark:border-white bg-white dark:bg-slate-900 hover:shadow-lg hover:scale-105"
                        }`}
                    >
                      <label
                        className={`flex items-center gap-3 p-4 ${isDisabled ? "cursor-not-allowed" : "cursor-pointer"
                          }`}
                      >
                        <RadioGroupItem
                          value={option.value}
                          id={option.value}
                          disabled={isDisabled}
                          className="w-6 h-6 border-2"
                        />
                        <div className="flex-1">
                          <div className={`font-black text-base uppercase tracking-wide ${tradeType === option.value && !isDisabled
                            ? "text-white dark:text-black"
                            : "text-black dark:text-white"
                            }`}>
                            {option.title}
                          </div>
                          <div className={`text-xs font-bold ${tradeType === option.value && !isDisabled
                            ? "text-gray-200 dark:text-gray-800"
                            : "text-slate-600 dark:text-slate-400"
                            }`}>
                            {isDisabled ? disabledReason : option.desc}
                          </div>
                        </div>
                      </label>
                    </Card>
                  );
                })}
              </div>
            </RadioGroup>
          </div>

          {/* Trade Details */}
          {selectedPlayerAddress && availableTradeTypes.includes(tradeType) && (
            <div className="border-4 border-black dark:border-white bg-slate-50 dark:bg-slate-900 p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 items-start">
                {/* Your Offer */}
                <div className="space-y-3 sm:space-y-4 sm:border-r-4 border-black dark:border-white sm:pr-4 md:pr-6 pb-4 sm:pb-0 border-b-4 sm:border-b-0">
                  <Label className="text-lg sm:text-xl md:text-2xl font-black uppercase tracking-wider">YOU OFFER</Label>
                  {(tradeType === "money-money" ||
                    tradeType === "money-property") && (
                      <MoneySelection
                        label="Amount"
                        value={offerMoney}
                        maxValue={currentPlayerMoney}
                        onChange={setOfferMoney}
                        id="offer-money"
                      />
                    )}
                  {(tradeType === "property-money" ||
                    tradeType === "property-property") && (
                      <PropertySelection
                        label="Property"
                        value={offerProperty}
                        properties={currentPlayerProperties}
                        onChange={setOfferProperty}
                        id="offer-property"
                      />
                    )}
                </div>

                {/* You Request */}
                <div className="space-y-3 sm:space-y-4">
                  <Label className="text-lg sm:text-xl md:text-2xl font-black uppercase tracking-wider">THEY GIVE</Label>
                  {(tradeType === "money-money" ||
                    tradeType === "property-money") && (
                      <MoneySelection
                        label="Amount"
                        value={requestMoney}
                        maxValue={selectedPlayerMoney}
                        onChange={setRequestMoney}
                        id="request-money"
                      />
                    )}
                  {(tradeType === "money-property" ||
                    tradeType === "property-property") && (
                      <PropertySelection
                        label="Property"
                        value={requestProperty}
                        properties={selectedPlayerProperties}
                        onChange={setRequestProperty}
                        id="request-property"
                      />
                    )}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-4 pt-4 sm:pt-6 border-t-4 border-black dark:border-white">
            <Button
              onClick={() => onOpenChange(false)}
              className="h-10 sm:h-12 px-4 sm:px-6 border-3 border-black dark:border-white bg-white dark:bg-slate-900 text-black dark:text-white font-black uppercase text-xs sm:text-sm tracking-wider hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTrade}
              loading={isRequesting}
              disabled={!isFormValid()}
              className="h-10 sm:h-12 px-6 sm:px-8 border-3 border-black dark:border-white bg-black dark:bg-white text-white dark:text-black font-black uppercase text-xs sm:text-sm tracking-wider hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              SEND OFFER
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
