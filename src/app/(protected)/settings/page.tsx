import { redirect } from "next/navigation";

// The Settings page was renamed to Account (Fase 1: profilo account e azienda).
// Keep this route alive as a permanent redirect for old bookmarks/links.
export default function SettingsPage() {
  redirect("/account");
}
