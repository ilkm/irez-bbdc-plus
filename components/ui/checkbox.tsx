import * as React from "react";
import { Checkbox as BaseCheckbox } from "@base-ui-components/react/checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
}

const Checkbox = React.forwardRef<HTMLElement, CheckboxProps>(
  ({ checked, onCheckedChange, id, className, disabled }, ref) => {
    return (
      <BaseCheckbox.Root
        ref={ref}
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(val) => onCheckedChange?.(val)}
        className={cn(
          "inline-flex w-4 h-4 items-center justify-center border border-line rounded-md cursor-pointer shrink-0",
          "bg-(--c-input-bg) transition-all duration-200",
          "data-checked:bg-accent data-checked:border-accent data-checked:shadow-[0_0_8px_rgba(74,158,255,0.4)]",
          "data-disabled:cursor-not-allowed data-disabled:opacity-40",
          className
        )}
      >
        <BaseCheckbox.Indicator className="text-white flex items-center justify-center">
          <Check className="w-3 h-3" strokeWidth={3} />
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
