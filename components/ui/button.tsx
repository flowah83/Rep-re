import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-2xl text-[15px] font-semibold tracking-tight transition-transform active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copper)]",
  {
    variants: {
      variant: {
        default: "h-12 w-full bg-[var(--btn-bg)] text-[var(--btn-ink)]",
        ghost: "h-12 w-full border border-[var(--line)] bg-transparent text-[var(--ink)]",
        quiet: "h-10 bg-transparent px-2 text-[var(--copper)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Button({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant }), className)} {...props} />;
}
