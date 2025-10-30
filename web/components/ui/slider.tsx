"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  onValueChange,
  onValueCommit,
  step = 1,
  showBubble = true,
  formatValue,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  onValueCommit?: (value: number[]) => void;
  showBubble?: boolean;
  formatValue?: (value: number) => string;
}) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [bubblePosition, setBubblePosition] = React.useState<{
    left: number;
    value: number;
  } | null>(null);
  const sliderRef = React.useRef<HTMLDivElement>(null);

  // Memoize values array to prevent unnecessary re-renders
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
        ? defaultValue
        : [min, max],
    [value, defaultValue, min, max]
  );

  // Calculate bubble position based on slider value
  const calculateBubblePosition = React.useCallback(
    (currentValue: number) => {
      if (!sliderRef.current) return null;

      const sliderRect = sliderRef.current.getBoundingClientRect();
      const percentage = (currentValue - min) / (max - min);
      const left = percentage * sliderRect.width;

      return { left, value: currentValue };
    },
    [min, max]
  );

  // Performance optimization for the value change handler
  const optimizedOnValueChange = React.useCallback(
    (newValue: number[]) => {
      if (onValueChange) {
        onValueChange(newValue);
      }

      // Update bubble position when value changes
      if (showBubble && newValue.length > 0) {
        const position = calculateBubblePosition(newValue[0]);
        setBubblePosition(position);
      }
    },
    [onValueChange, showBubble, calculateBubblePosition]
  );

  // Handle value commit (when user releases the slider)
  const optimizedOnValueCommit = React.useCallback(
    (newValue: number[]) => {
      if (onValueCommit) {
        onValueCommit(newValue);
      }
      setIsDragging(false);
    },
    [onValueCommit]
  );

  // Handle mouse/touch events for bubble visibility
  const handlePointerDown = React.useCallback(() => {
    setIsDragging(true);
    if (showBubble && _values.length > 0) {
      const position = calculateBubblePosition(_values[0]);
      setBubblePosition(position);
    }
  }, [showBubble, _values, calculateBubblePosition]);

  const handlePointerUp = React.useCallback(() => {
    setIsDragging(false);
  }, []);

  // Format value for display
  const displayValue = React.useMemo(() => {
    if (!bubblePosition) return "";
    return formatValue
      ? formatValue(bubblePosition.value)
      : bubblePosition.value.toString();
  }, [bubblePosition, formatValue]);

  return (
    <div className="relative">
      <SliderPrimitive.Root
        ref={sliderRef}
        data-slot="slider"
        defaultValue={defaultValue}
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={optimizedOnValueChange}
        onValueCommit={optimizedOnValueCommit}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        className={cn(
          "relative flex w-full touch-auto items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col py-3",
          className
        )}
        {...props}
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={cn(
            "bg-muted relative grow overflow-hidden rounded-full data-[orientation=horizontal]:h-2.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2.5 shadow-inner border border-muted/50"
          )}
        >
          <SliderPrimitive.Range
            data-slot="slider-range"
            className={cn(
              "bg-chart-4 absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
            )}
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className="border-chart-4 bg-white ring-chart-4/20 block size-6 shrink-0 rounded-full border-2 shadow-md hover:ring-2 focus-visible:ring-2 focus-visible:outline-hidden active:cursor-grabbing cursor-grab disabled:pointer-events-none disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Root>

      {showBubble && bubblePosition && isDragging && (
        <div
          className="absolute pointer-events-none z-10 transition-opacity duration-200"
          style={{
            left: `${bubblePosition.left}px`,
            top: "-40px",
            transform: "translateX(-50%)",
          }}
        >
          <div className="bg-chart-4 text-white text-sm px-2 py-1 rounded-md shadow-lg relative">
            {displayValue}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-chart-4"></div>
          </div>
        </div>
      )}
    </div>
  );
}

export { Slider };
