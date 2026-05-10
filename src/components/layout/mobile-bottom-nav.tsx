"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, FileScan, Home, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: any };

const ITEMS: readonly Item[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/interventions", label: "Interventions", icon: ClipboardList },
  { href: "/documents", label: "Documents", icon: FileScan },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
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
                "flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium",
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
  );
}

