import { NotesClient } from "@/components/notes/notes-client";
import { OfflineBanner } from "@/components/offline/offline-banner";
import { getTranslations } from "next-intl/server";

export default async function NotesPage() {
  const t = await getTranslations("notes.page");
  return (
    <div className="space-y-3">
      <header className="space-y-0.5">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      <OfflineBanner />
      <NotesClient />
    </div>
  );
}
