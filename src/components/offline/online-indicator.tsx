"use client";

import { useOnlineStatus } from "@/hooks/use-online-status";

export function OnlineIndicator() {
  const online = useOnlineStatus();
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={[
          "inline-block h-2.5 w-2.5 rounded-full border",
          online ? "bg-emerald-500 border-emerald-600" : "bg-amber-500 border-amber-600"
        ].join(" ")}
        aria-hidden="true"
      />
      <span>{online ? "Online" : "Offline"}</span>
    </span>
  );
}

