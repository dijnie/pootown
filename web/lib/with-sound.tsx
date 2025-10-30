/**
 * withSound HOC - Adds click and hover sound effects to any component
 * 
 * Usage:
 * const ClickableDiv = withSound('div');
 * <ClickableDiv onClick={...}>Content</ClickableDiv>
 */

import React from 'react';
import { playSound, SOUND_CONFIG } from '@/lib/soundUtil';

interface WithSoundProps {
  noSound?: boolean;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLElement>) => void;
}

export function withSound<P extends object>(
  Component: React.ComponentType<P> | string
) {
  return React.forwardRef<HTMLElement, P & WithSoundProps>((props, ref) => {
    const { noSound = false, disabled = false, onClick, onMouseEnter, ...rest } = props as any;

    const handleClick = (e: React.MouseEvent<HTMLElement>) => {
      if (disabled) return;
      
      if (!noSound) {
        playSound("button-click", SOUND_CONFIG.volumes.buttonClick);
      }
      
      onClick?.(e);
    };

    const handleMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
      if (disabled) return;
      
      if (!noSound) {
        playSound("button-hover", SOUND_CONFIG.volumes.buttonHover);
      }
      
      onMouseEnter?.(e);
    };

    return React.createElement(Component as any, {
      ...rest,
      ref,
      onClick: onClick ? handleClick : undefined,
      onMouseEnter: onMouseEnter || onClick ? handleMouseEnter : undefined,
    });
  });
}

// Pre-created clickable HTML elements with sound
export const ClickableDiv = withSound('div');
export const ClickableButton = withSound('button');
export const ClickableSpan = withSound('span');
export const ClickableA = withSound('a');
