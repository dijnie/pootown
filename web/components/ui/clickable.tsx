import React from "react";
import { playSound, SOUND_CONFIG } from "@/lib/soundUtil";
import { cn } from "@/lib/utils";

interface ClickableProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  noSound?: boolean;
  className?: string;
  disabled?: boolean;
}

/**
 * Clickable wrapper component that automatically plays sound effects
 * Use this for any clickable element that is not a Button component
 */
export const Clickable: React.FC<ClickableProps> = ({
  children,
  onClick,
  noSound = false,
  className,
  disabled = false,
  ...props
}) => {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    
    if (!noSound) {
      playSound("button-click", SOUND_CONFIG.volumes.buttonClick);
    }
    
    onClick?.(e);
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    
    if (!noSound) {
      playSound("button-hover", SOUND_CONFIG.volumes.buttonHover);
    }
    
    props.onMouseEnter?.(e);
  };

  return (
    <div
      {...props}
      className={cn(
        disabled && "opacity-50 cursor-not-allowed pointer-events-none",
        !disabled && "cursor-pointer",
        className
      )}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
    >
      {children}
    </div>
  );
};
