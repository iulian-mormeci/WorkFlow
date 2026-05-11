import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

export function LegalFooter() {
  const t = useTranslations();
  return (
    <footer className="border-t bg-muted/15">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="leading-relaxed">
          © {new Date().getFullYear()} {t("common.appName")} · {t("footer.personalTool")}
        </p>
        <nav aria-label={t("footer.legalLinksAria")} className="flex flex-wrap gap-x-4 gap-y-2">
          <Link className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" href="/privacy">
            {t("footer.privacy")}
          </Link>
          <Link className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" href="/terms">
            {t("footer.terms")}
          </Link>
          <Link className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" href="/accessibility">
            {t("footer.accessibility")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}

