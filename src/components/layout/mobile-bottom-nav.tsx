"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, FileScan, Home, Layers, Plus, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: any };

const ITEMS: readonly Item[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/interventions", label: "Interventions", icon: ClipboardList },
  { href: "/documents", label: "Documents", icon: FileScan },
  { href: "/templates", label: "Templates", icon: Layers },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <>
      {/* New Intervention FAB (phones) */}
      <Link
        href="/interventions?new=1"
        aria-label="New intervention"
        className={cn(
          "fixed bottom-[calc(3.5rem+0.75rem)] right-4 z-50 md:hidden",
          "flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg",
          "touch-manipulation active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        )}
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <Plus className="h-6 w-6" />
      </Link>

      <nav
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur",
          "md:hidden"
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto grid max-w-7xl grid-cols-5">
          {ITEMS.map((it) => {
            const active = pathname === it.href || pathname.startsWith(it.href + "/");
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium",
                  "touch-manipulation",
                  active ? "text-foreground" : "text-muted-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5", active ? "text-foreground" : "text-muted-foreground")} />
                <span className="truncate">{it.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

