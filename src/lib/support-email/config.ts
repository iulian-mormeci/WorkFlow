"use client";

export const SUPPORT_EMAIL_TO_KEY = "workflow:supportEmailTo";

export function getSupportEmailTo() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(SUPPORT_EMAIL_TO_KEY) ?? "";
}

export function setSupportEmailTo(to: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SUPPORT_EMAIL_TO_KEY, to);
}

