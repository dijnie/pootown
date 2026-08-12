"use client";

import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { getAvatarForPlayer } from "@/lib/avatar-utils";

interface UserAvatarProps {
  playerId: string;
  alt?: string;
  fallback?: string | React.ReactNode;
  size?: "xs" | "sm" | "md" | "lg";
  classNames?: {
    avatar?: string;
    image?: string;
    fallback?: string;
  };
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  playerId,
  alt,
  fallback,
  size = "md",
  classNames,
}) => {
  const avatarSrc = getAvatarForPlayer(playerId);

  return (
    <Avatar
      className={cn(
        {
          "w-6 h-6": size === "xs",
          "w-8 h-8": size === "sm",
          "size-10": size === "md",
          "size-12": size === "lg",
        },
        classNames?.avatar
      )}
    >
      <AvatarImage
        src={avatarSrc}
        alt={alt || `Player ${playerId}`}
        className={classNames?.image}
      />
      <AvatarFallback
        playerId={playerId}
        className={cn("text-white font-semibold", classNames?.fallback)}
      >
        {fallback || playerId.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
};
