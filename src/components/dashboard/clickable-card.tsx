import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";

/**
 * Shared hover/tap affordance for clickable dashboard cards.
 * Subtle ring + slight scale-down on press; touch-friendly and consistent.
 */
export const CLICKABLE_CARD =
  "cursor-pointer transition-all duration-150 hover:ring-2 hover:ring-primary/20 active:scale-[0.985]";

/**
 * Small "view all →" link used in card headers whose body already contains
 * per-item links (so we can't wrap the whole card in an anchor).
 */
export function ViewAllLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {label}
      <ChevronRight className="h-3.5 w-3.5" />
    </Link>
  );
}
