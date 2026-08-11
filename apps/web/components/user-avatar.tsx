"use client";

import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { getRandomAvatarByAddress } from "@/lib/avatar-utils";

interface UserAvatarProps {
  walletAddress: string;
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
  walletAddress,
  alt,
  fallback,
  size = "md",
  classNames,
}) => {
  const avatarSrc = getRandomAvatarByAddress(walletAddress);

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
        alt={alt || `Player ${walletAddress}`}
        className={classNames?.image}
      />
      <AvatarFallback
        walletAddress={walletAddress}
        className={cn("text-white font-semibold", classNames?.fallback)}
      >
        {fallback || walletAddress.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
};
