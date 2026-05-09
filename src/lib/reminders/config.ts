const KEY = "workflow:reminderDefaultEmail";

export function getReminderDefaultEmail(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(KEY)?.trim() ?? "";
}

export function setReminderDefaultEmail(to: string) {
  if (typeof window === "undefined") return;
  const v = to.trim();
  if (!v) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, v);
}
