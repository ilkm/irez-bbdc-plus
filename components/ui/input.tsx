import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        className={cn(
          "bg-(--c-input-bg) border border-(--c-input-border) px-3 py-[5px] text-xs text-primary rounded-lg",
          "outline-none transition-all duration-200",
          "placeholder:text-secondary/60",
          "focus:border-accent/50 focus:shadow-[0_0_12px_rgba(74,158,255,0.15)]",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
