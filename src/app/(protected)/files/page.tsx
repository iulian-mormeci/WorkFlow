import { getTranslations } from "next-intl/server";
import { FileBrowser } from "@/components/files/file-browser";

export const dynamic = "force-dynamic";

export default async function FilesPage() {
  const t = await getTranslations();
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("nav.files")}</h1>
        <p className="text-sm text-muted-foreground">{t("files.root")}</p>
      </header>

      <FileBrowser />
    </div>
  );
}
