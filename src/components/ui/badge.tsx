import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 h-[22px] px-2 text-[11.5px] font-medium leading-none tracking-[0.005em] rounded-full border border-transparent cursor-default whitespace-nowrap [&_svg]:size-[11px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Semantic
        success: "bg-[hsl(var(--success-bg))] text-[hsl(var(--success-fg))]",
        warning: "bg-[hsl(var(--warning-bg))] text-[hsl(var(--warning-fg))]",
        accent: "bg-[hsl(var(--accent-soft))] text-[hsl(var(--accent-soft-fg))]",
        neutral: "bg-[hsl(var(--brand-primary)/0.06)] text-text-secondary",
        danger: "bg-[hsl(var(--danger-fg)/0.08)] text-[hsl(var(--danger-fg))]",
        info: "bg-[hsl(var(--info-bg))] text-[hsl(var(--info-fg))]",
        // Aliases (back-compat)
        default: "bg-[hsl(var(--brand-primary))] text-text-on-dark",
        secondary: "bg-[hsl(var(--brand-primary)/0.06)] text-text-secondary",
        destructive: "bg-[hsl(var(--danger-fg)/0.08)] text-[hsl(var(--danger-fg))]",
        outline: "bg-transparent text-text-secondary border-subtle",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: string;
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: dot }}
          aria-hidden
        />
      )}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
