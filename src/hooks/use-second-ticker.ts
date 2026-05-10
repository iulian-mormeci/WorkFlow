"use client";

import { useEffect, useState } from "react";

/** Forces a re-render every `ms` (default 1s) for live elapsed timers. */
export function useSecondTicker(ms = 1000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return tick;
}

