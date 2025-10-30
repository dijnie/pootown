import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-14 w-full bg-white text-black border-4 border-black shadow-[6px_6px_0_#000] px-6 py-3 text-lg font-bold uppercase placeholder:text-gray-500 transition-all",
          "focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:translate-x-1 focus-visible:translate-y-1 focus-visible:shadow-[3px_3px_0_#000]",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
          "hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[4px_4px_0_#000]",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
