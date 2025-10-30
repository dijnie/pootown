"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGameContext } from "@/components/providers/game-provider";
import { colorMap, type BoardSpace } from "@/configs/board-data";
import { useWallet } from "@/hooks/use-wallet";
import { getBoardSpaceData } from "@/lib/board-utils";

export function OwnedProperties() {
  const { wallet } = useWallet();
  const { properties: allProperties } = useGameContext();

  const ownedProperties = allProperties.filter(
    (property) => property.owner === wallet?.address
  );

  console.log("ownedProperties", ownedProperties);

  if (!ownedProperties.length) {
    return (
      <Card className="bg-white">
        <CardHeader>
          <CardTitle>My properties (0)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-center text-sm">
            No properties owned
          </p>
        </CardContent>
      </Card>
    );
  }

  const getPropertyIcon = (propertyData: BoardSpace) => {
    if (propertyData.type === "property") {
      return (
        <div
          className="w-4 h-4 rounded-sm border border-gray-300"
          style={{ backgroundColor: colorMap[propertyData.colorGroup] }}
        />
      );
    } else if (propertyData.type === "railroad") {
      return (
        <div className="w-4 h-4 rounded-sm bg-black flex items-center justify-center">
          <span className="text-white text-xs font-bold">🚂</span>
        </div>
      );
    } else {
      return (
        <div className="w-4 h-4 rounded-sm bg-gray-400 flex items-center justify-center">
          <span className="text-white text-xs font-bold">⚡</span>
        </div>
      );
    }
  };

  return (
    <Card className="bg-white">
      <CardHeader>
        <CardTitle>My properties ({ownedProperties.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {ownedProperties.map((property) => {
          const propertyData = getBoardSpaceData(property.position);
          if (!propertyData) {
            return null;
          }

          return (
            <Card
              key={property.position}
              className="hover:bg-gray-50 transition-colors py-3"
            >
              <CardContent className="px-3">
                <div className="flex items-center gap-3">
                  {getPropertyIcon(propertyData)}
                  <div className="flex-1 flex gap-3 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {propertyData.name}
                    </p>
                    {/* {propertyData.type === "property" && (
                      <div className="flex items-center space-x-2 mt-1">
                        <Badge
                          //   variant="outline"
                          className="text-xs"
                          style={{
                            borderColor: colorMap[propertyData.colorGroup],
                            color: colorMap[propertyData.colorGroup],
                          }}
                        >
                          {propertyData.colorGroup}
                        </Badge>
                      </div>
                    )} */}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </CardContent>
      {/* <div className="space-y-4">
        <h2 className="text-lg font-semibold">
          My properties ({ownedProperties.length})
        </h2>

        <div className="space-y-4"></div>
      </div> */}
    </Card>
  );
}
