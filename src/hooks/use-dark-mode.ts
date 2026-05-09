"use client";

import { useEffect, useState } from "react";

const key = "workflow:theme";

function applyTheme(theme: "light" | "dark") {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
}

export function useDarkMode() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = (localStorage.getItem(key) as "light" | "dark" | null) ?? null;
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
    const initial = saved ?? (prefersDark ? "dark" : "light");
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem(key, next);
    applyTheme(next);
  }

  return { theme, toggle };
}

