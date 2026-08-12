import React from "react";
import { cn } from "@/lib/utils";
import {
  getBorderClasses,
  getBoardSide,
  getColorBarClasses,
  getOwnerIndicatorClasses,
  getTextContainerClasses,
} from "@/lib/board-utils";
import { useSpaceOwner } from "@/hooks/useSpaceOwner";
import { BaseSpaceProps } from "@/types/space-types";
import { UserAvatar } from "@/components/user-avatar";

interface BaseSpaceComponentProps extends BaseSpaceProps {
  children: React.ReactNode;
  colorBarColor?: string;
  showColorBar?: boolean;
  className?: string;
  contentContainerclassName?: string;
}

export const BaseSpace: React.FC<BaseSpaceComponentProps> = ({
  position,
  onClick,
  propertyState,
  children,
  colorBarColor,
  showColorBar = false,
  className = "",
  contentContainerclassName = "",
}) => {
  const { ownerId } = useSpaceOwner(propertyState);
  const side = getBoardSide(position);
  const hasColorBar = showColorBar && !!colorBarColor;

  const borderClasses = getBorderClasses(position);
  const colorBarClasses = getColorBarClasses(side);
  const ownerIndicatorClasses = getOwnerIndicatorClasses(side);
  const textContainerClasses = getTextContainerClasses(side);

  return (
    <div
      className={cn(
        "bg-board-space relative cursor-pointer board-space-container",
        borderClasses,
        className
      )}
      onClick={() => onClick?.(position)}
    >
      {hasColorBar && (
        <div
          style={{
            backgroundColor: colorBarColor,
            // scale thickness with the tile; horizontal vs vertical based on side
            height:
              side === "top" || side === "bottom"
                ? "var(--bar-thickness-inline)"
                : undefined,
            width:
              side === "left" || side === "right"
                ? "var(--bar-thickness-inline)"
                : undefined,
          }}
          className={colorBarClasses}
        />
      )}

      {/* Owner indicator */}
      {ownerId && (
        <div
          className={cn(
            "flex items-center justify-center",
            ownerIndicatorClasses
          )}
        >
          <UserAvatar
            classNames={{
              avatar: "owner-avatar",
            }}
            playerId={ownerId}
          />
        </div>
      )}

      {/* Content container with proper text positioning */}
      <div className={cn(textContainerClasses, contentContainerclassName)}>
        {children}
      </div>
    </div>
  );
};
