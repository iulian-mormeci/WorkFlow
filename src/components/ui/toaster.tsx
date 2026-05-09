"use client";

import { ToastItem, ToastProvider, ToastViewport } from "@/components/ui/toast";
import { useToastStore } from "@/hooks/use-toast";

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <ToastProvider>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onOpenChange={(open) => !open && dismiss(t.id)} />
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}

