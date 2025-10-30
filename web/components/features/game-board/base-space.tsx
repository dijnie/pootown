import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  onChainProperty,
  children,
  colorBarColor,
  showColorBar = false,
  className = "",
  contentContainerclassName = "",
  ...rest
}) => {
  const { ownerAddress } = useSpaceOwner(onChainProperty);
  const side = getBoardSide(position);
  const hasColorBar = showColorBar && !!colorBarColor;

  const borderClasses = getBorderClasses(position);
  const colorBarClasses = getColorBarClasses(side);
  const ownerIndicatorClasses = getOwnerIndicatorClasses(side);
  const textContainerClasses = getTextContainerClasses(side);

  return (
    // @ts-expect-error
    <div
      className={cn(
        "bg-board-space relative cursor-pointer board-space-container",
        borderClasses,
        className
      )}
      {...rest}
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
      {ownerAddress && (
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
            walletAddress={ownerAddress}
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
