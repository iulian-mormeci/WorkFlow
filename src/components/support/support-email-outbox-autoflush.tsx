"use client";

import { useEffect } from "react";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { flushSupportEmailOutbox } from "@/lib/support-email/send";

export function SupportEmailOutboxAutoFlush() {
  const online = useOnlineStatus();

  useEffect(() => {
    if (!online) return;
    void flushSupportEmailOutbox();
  }, [online]);

  return null;
}

