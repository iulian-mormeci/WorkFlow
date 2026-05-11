"use client";

import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export type Toast = {
  id: string;
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
  /** Optional action (e.g. Retry after sync failure). */
  action?: { label: string; onClick: () => void };
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return <ToastPrimitive.Provider swipeDirection="right">{children}</ToastPrimitive.Provider>;
}

export function ToastViewport() {
  return (
    <ToastPrimitive.Viewport
      className={cn(
        "fixed bottom-0 right-0 z-50 flex w-full flex-col gap-2 p-4 sm:max-w-sm"
      )}
    />
  );
}

export function ToastItem({
  toast,
  onOpenChange
}: {
  toast: Toast;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const destructive = toast.variant === "destructive";
  const duration = toast.action ? 12_000 : 4000;
  return (
    <ToastPrimitive.Root
      open
      onOpenChange={onOpenChange}
      duration={duration}
      className={cn(
        "rounded-2xl border bg-background p-4 shadow-lg",
        destructive && "border-red-200 bg-red-50"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          {toast.title ? (
            <ToastPrimitive.Title className={cn("text-sm font-semibold", destructive && "text-red-800")}>
              {toast.title}
            </ToastPrimitive.Title>
          ) : null}
          {toast.description ? (
            <ToastPrimitive.Description className={cn("text-sm text-muted-foreground", destructive && "text-red-700")}>
              {toast.description}
            </ToastPrimitive.Description>
          ) : null}
          {toast.action ? (
            <div className="pt-2">
              <Button
                type="button"
                size="sm"
                variant={destructive ? "secondary" : "default"}
                className="h-8"
                onClick={() => {
                  toast.action?.onClick();
                  onOpenChange(false);
                }}
              >
                {toast.action.label}
              </Button>
            </div>
          ) : null}
        </div>
        <ToastPrimitive.Close asChild>
          <button className="shrink-0 rounded-lg p-1 hover:bg-muted" aria-label={t("common.close")}>
            <X className="h-4 w-4" />
          </button>
        </ToastPrimitive.Close>
      </div>
    </ToastPrimitive.Root>
  );
}

