import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-opacity duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal)]/40 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "bg-[var(--ink)] px-5 text-white hover:opacity-90",
        outline:
          "border border-[var(--line)] bg-white px-4 text-[var(--ink)] hover:bg-[var(--bg-subtle)]",
        ghost: "px-3 text-[var(--muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink)]",
      },
      size: {
        default: "px-5",
        sm: "min-h-9 px-3 text-xs",
        lg: "min-h-12 px-6",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
