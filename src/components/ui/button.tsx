import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:bg-accent-2 shadow-[inset_0_1px_0_rgb(255_255_255/.35),0_1px_2px_rgb(0_0_0/.2)] hover:shadow-[var(--shadow-glow)]",
        secondary: "bg-surface-2 text-fg hover:bg-surface-3 hairline",
        ghost: "text-fg-2 hover:bg-surface-2 hover:text-fg",
        outline: "border border-border-strong bg-transparent text-fg hover:bg-surface-2",
        danger: "bg-danger/12 text-danger hover:bg-danger/20 hairline",
        link: "text-accent-2 underline-offset-4 hover:underline h-auto p-0",
      },
      size: {
        sm: "h-8 px-3 text-[13px] rounded-sm",
        md: "h-9 px-3.5",
        lg: "h-11 px-5 text-[15px] rounded-lg",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8 rounded-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 className="animate-spin" /> : null}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
export { buttonVariants };
