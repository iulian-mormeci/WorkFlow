import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "outline" | "ghost";
type Size = "default" | "sm" | "lg" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium " +
  "transition-colors transition-transform active:scale-[0.99] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 " +
  "disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  default: "bg-primary text-primary-foreground hover:opacity-95",
  secondary: "bg-muted text-foreground hover:opacity-95",
  outline: "border bg-background hover:bg-muted",
  ghost: "hover:bg-muted"
};

const sizes: Record<Size, string> = {
  default: "h-11 px-4",
  sm: "h-10 px-3",
  lg: "h-12 px-5 text-base",
  icon: "h-11 w-11"
};

export function Button({
  className,
  variant = "default",
  size = "default",
  asChild,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}) {
  const Comp: any = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}

