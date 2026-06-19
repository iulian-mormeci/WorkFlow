"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Bell, BookOpen, Globe } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/auth";
import { useNotificationsStore } from "@/stores/notifications";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

function useRelativeDate() {
  const t = useTranslations("notifications.relative");
  return (iso: string): string => {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return t("justNow");
    if (minutes < 60) return t("minutesAgo", { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("hoursAgo", { n: hours });
    const days = Math.floor(hours / 24);
    return t("daysAgo", { n: days });
  };
}

export function NotificationsBell({ className }: { className?: string }) {
  const t = useTranslations();
  const relativeDate = useRelativeDate();
  const user = useAuthStore((s) => s.user);
  const { unread, notifications, markAllRead } = useNotificationsStore();
  const [open, setOpen] = useState(false);

  async function handleOpen(next: boolean) {
    setOpen(next);
    if (!next || unread === 0 || !user) return;

    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    markAllRead();
    await supabase
      .from("wf_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={t("notifications.bellLabel")}
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground",
            "transition-colors hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
            className
          )}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={6}
          className={cn(
            "z-[100] w-80 rounded-2xl border bg-background shadow-lg",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
          )}
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">{t("notifications.panelTitle")}</span>
            </div>
          </div>

          <div className="max-h-[28rem] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t("notifications.empty")}
              </p>
            ) : (
              <ul className="divide-y">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <Link
                      href="/procedures"
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50",
                        !n.readAt && "bg-violet-50/60 dark:bg-violet-950/20"
                      )}
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-violet-100 dark:bg-violet-950/40">
                        <Globe className="h-4 w-4 text-violet-600" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-1">
                          <span className="line-clamp-2 font-medium leading-snug">
                            <BookOpen className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" />
                            {n.title}
                          </span>
                          {!n.readAt && (
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-violet-500" />
                          )}
                        </div>
                        {n.body && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {t("notifications.createdBy", { email: n.body })}
                          </p>
                        )}
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {relativeDate(n.createdAt)}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
