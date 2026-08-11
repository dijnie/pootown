import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";
import { playSound, SOUND_CONFIG } from "@/lib/soundUtil";

const buttonVariants = cva(
  "inline-flex items-center justify-center cursor-pointer whitespace-nowrap rounded-base text-sm font-base ring-offset-white transition-all gap-2 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "text-main-foreground bg-main border-2 border-border shadow-shadow hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none",
        noShadow: "text-main-foreground bg-main border-2 border-border",
        neutral:
          "bg-secondary-background text-foreground border-2 border-border shadow-shadow hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none",
        reverse:
          "text-main-foreground bg-main border-2 border-border hover:translate-x-reverseBoxShadowX hover:translate-y-reverseBoxShadowY hover:shadow-shadow",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-8",
        icon: "size-10",
      },
      loading: {
        true: "!text-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  children,
  className,
  variant,
  size,
  disabled,
  asChild = false,
  loading = false,
  noSound = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
    noSound?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Play click sound
    if (!noSound && !disabled && !loading) {
      playSound("button-click", SOUND_CONFIG.volumes.buttonClick);
    }
    
    // Call original onClick if provided
    if (props.onClick) {
      props.onClick(e);
    }
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Play hover sound
    if (!noSound && !disabled && !loading) {
      playSound("button-hover", SOUND_CONFIG.volumes.buttonHover);
    }
    
    // Call original onMouseEnter if provided
    if (props.onMouseEnter) {
      props.onMouseEnter(e);
    }
  };

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className, loading }))}
      disabled={disabled || loading}
      {...props}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
    >
      {loading && (
        <Spinner variant="bars" className={cn("!text-foreground absolute")} />
      )}
      <Slottable>{children}</Slottable>
    </Comp>
  );
}

export { Button, buttonVariants };
