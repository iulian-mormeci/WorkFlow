import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

