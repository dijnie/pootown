"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";

import * as React from "react";

import { cn } from "@/lib/utils";
import { getAvatarForPlayer } from "@/lib/avatar-utils";

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex size-10 shrink-0 overflow-hidden rounded-full outline-2 outline-border",
        className
      )}
      {...props}
    />
  );
}

function AvatarImage({
  className,
  playerId,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image> & {
  playerId?: string;
}) {
  const avatarSrc = playerId ? getAvatarForPlayer(playerId) : undefined;

  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      src={avatarSrc}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  playerId,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback> & {
  playerId?: string;
}) {
  // Generate fallback text from playerId address (first 2 characters)
  const fallbackText = playerId ? playerId.slice(0, 2).toUpperCase() : "??";

  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-secondary-background text-foreground font-base",
        className
      )}
      {...props}
    >
      {fallbackText}
    </AvatarPrimitive.Fallback>
  );
}

export { Avatar, AvatarImage, AvatarFallback };
