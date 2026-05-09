import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";
type Tone = "default" | "muted" | "primary" | "success" | "warning";

const sizeClass: Record<Size, string> = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6"
};

const toneClass: Record<Tone, string> = {
  default: "text-foreground",
  muted: "text-muted-foreground",
  primary: "text-primary",
  success: "text-emerald-600 dark:text-emerald-300",
  warning: "text-amber-600 dark:text-amber-300"
};

export function Icon({
  icon: IconCmp,
  size = "sm",
  tone = "muted",
  className
}: {
  icon: LucideIcon;
  size?: Size;
  tone?: Tone;
  className?: string;
}) {
  return (
    <IconCmp className={cn("shrink-0", sizeClass[size], toneClass[tone], className)} />
  );
}

export function IconBubble({
  icon,
  tone = "muted",
  className
}: {
  icon: LucideIcon;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-2xl border bg-muted/40",
        "shadow-sm shadow-black/5",
        className
      )}
    >
      <Icon icon={icon} size="md" tone={tone} />
    </div>
  );
}

