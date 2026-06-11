import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-[13px] font-medium tracking-[-0.005em] select-none transition-[background-color,border-color,box-shadow,transform] duration-[140ms] ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_hsl(var(--accent-h)/0.24)] disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-[15px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary — dark brand action
        default:
          "bg-[hsl(var(--brand-primary))] text-text-on-dark border border-transparent shadow-[0_1px_2px_hsl(var(--brand-primary)/0.10),inset_0_1px_0_hsl(0_0%_100%/0.08)] hover:bg-[hsl(var(--brand-primary-hover))] hover:shadow-[0_2px_6px_hsl(var(--brand-primary)/0.16),inset_0_1px_0_hsl(0_0%_100%/0.10)]",
        primary:
          "bg-[hsl(var(--brand-primary))] text-text-on-dark border border-transparent shadow-[0_1px_2px_hsl(var(--brand-primary)/0.10),inset_0_1px_0_hsl(0_0%_100%/0.08)] hover:bg-[hsl(var(--brand-primary-hover))] hover:shadow-[0_2px_6px_hsl(var(--brand-primary)/0.16),inset_0_1px_0_hsl(0_0%_100%/0.10)]",
        // Secondary — light surface, default for 80% of actions
        secondary:
          "bg-bg-surface text-text-primary border border-subtle shadow-[0_1px_0_hsl(var(--brand-primary)/0.04)] hover:bg-bg-surface-2 hover:border-strong hover:shadow-[0_1px_2px_hsl(var(--brand-primary)/0.08)] [&_svg]:text-text-secondary hover:[&_svg]:text-text-primary",
        // Outline — alias of secondary
        outline:
          "bg-bg-surface text-text-primary border border-subtle shadow-[0_1px_0_hsl(var(--brand-primary)/0.04)] hover:bg-bg-surface-2 hover:border-strong hover:shadow-[0_1px_2px_hsl(var(--brand-primary)/0.08)] [&_svg]:text-text-secondary hover:[&_svg]:text-text-primary",
        // Ghost — transparent, for toolbars / icon controls
        ghost:
          "bg-transparent text-text-secondary border border-transparent hover:bg-bg-surface-2 hover:text-text-primary",
        // Accent — orange CTA, max 1 per viewport
        accent:
          "bg-[hsl(var(--accent-h))] text-white font-semibold border border-transparent shadow-[0_1px_2px_hsl(var(--accent-h)/0.30),inset_0_1px_0_hsl(0_0%_100%/0.20)] hover:bg-[hsl(var(--accent-hover-h))] hover:shadow-[0_2px_8px_hsl(var(--accent-h)/0.38)]",
        // Destructive — soft danger
        destructive:
          "bg-bg-surface text-[hsl(var(--danger-fg))] border border-[hsl(var(--danger-fg)/0.20)] hover:bg-[hsl(var(--danger-fg)/0.06)] hover:border-[hsl(var(--danger-fg)/0.40)]",
        link:
          "text-[hsl(var(--brand-primary))] underline-offset-4 hover:underline border border-transparent bg-transparent",
      },
      size: {
        default: "h-9 px-3.5",
        md: "h-9 px-3.5",
        sm: "h-[30px] px-2.5 text-[12px] rounded-md gap-1",
        lg: "h-10 px-4.5 text-[14px]",
        icon: "h-9 w-9 px-0",
        "icon-sm": "h-[30px] w-[30px] px-0 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    if (asChild) {
      return (
        <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Comp>
      );
    }
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }), loading && "pointer-events-none")}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        <span className={cn("inline-flex items-center gap-1.5", loading && "opacity-0")}>{children}</span>
        {loading && (
          <span className="absolute inset-0 inline-flex items-center justify-center">
            <Loader2 className="animate-spin" />
          </span>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
