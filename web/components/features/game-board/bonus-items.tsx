"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGameContext } from "@/components/providers/game-provider";

export function BonusItems() {
  const { currentPlayerState } = useGameContext();

  if (!currentPlayerState) {
    return null;
  }

  const getOutOfJailCards = currentPlayerState.getOutOfJailCards || 0;

  // If no bonus items, show empty state
  if (getOutOfJailCards === 0) {
    return (
      <Card className="bg-white">
        <CardHeader>
          <CardTitle>Bonus Items</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-center text-sm">No bonus items</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white">
      <CardHeader>
        <CardTitle>Bonus Items</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {getOutOfJailCards > 0 && (
          <BonusItemCard
            icon="🔑"
            title="Get Out of Jail Card"
            description="Use to get out of jail for free"
            count={getOutOfJailCards}
            bgColor="bg-gray-50"
            iconBgColor="bg-yellow-500"
            countBgColor="bg-yellow-100"
            countTextColor="text-yellow-800"
            onClick={() => {}}
          />
        )}

        {/* Future bonus items can be added here */}
        {/* Example structure for future items:
        {someOtherBonus > 0 && (
          <BonusItemCard
            icon="🎁"
            title="Some Other Bonus"
            description="Description of the bonus"
            count={someOtherBonus}
            bgColor="bg-gray-50"
            iconBgColor="bg-blue-500"
            countBgColor="bg-blue-100"
            countTextColor="text-blue-800"
            onClick={handleSomeOtherBonusClick}
          />
        )}
        */}
      </CardContent>
    </Card>
  );
}

interface BonusItemCardProps {
  icon: string;
  title: string;
  description: string;
  count: number;
  bgColor: string;
  iconBgColor: string;
  countBgColor: string;
  countTextColor: string;
  onClick?: () => void;
}

export function BonusItemCard({
  icon,
  title,
  description,
  count,
  bgColor,
  iconBgColor,
  countBgColor,
  countTextColor,
  onClick,
}: BonusItemCardProps) {
  return (
    <div
      className={`flex items-center gap-3 ${bgColor} rounded-lg cursor-pointer hover:opacity-80 transition-opacity`}
      onClick={onClick}
    >
      <div
        className={`w-8 h-8 ${iconBgColor} rounded-lg flex items-center justify-center`}
      >
        <span className="text-white text-sm font-bold">{icon}</span>
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-gray-600">{description}</p>
      </div>
      <div
        className={`${countBgColor} ${countTextColor} px-2 py-1 rounded-full text-xs font-medium`}
      >
        {count}
      </div>
    </div>
  );
}
