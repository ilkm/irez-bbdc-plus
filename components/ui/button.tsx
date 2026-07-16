import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center font-medium transition-all duration-200 focus-visible:outline-none disabled:opacity-40 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default:
          "bg-accent/20 border border-accent/40 text-accent-hover hover:bg-accent/30 hover:border-accent/60 hover:shadow-[0_0_12px_rgba(74,158,255,0.3)]",
        ghost:
          "bg-hover border border-line text-primary hover:bg-accent/10 hover:border-accent/20",
        link:
          "text-accent hover:text-accent-hover underline-offset-4",
      },
      size: {
        default: "h-[28px] px-3 text-xs rounded-lg",
        sm: "h-[24px] px-2 text-xs rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
