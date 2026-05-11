export const dynamic = "force-static";

import { getTranslations } from "next-intl/server";

export default async function AccessibilityPage() {
  const t = await getTranslations();
  const updatedAt = "11 maggio 2026";

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("legal.accessibility.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("legal.updatedAt", { date: updatedAt })}</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("legal.accessibility.s1.title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("legal.accessibility.s1.body")}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("legal.accessibility.s2.title")}</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t("legal.accessibility.s2.items.focus")}</li>
          <li>{t("legal.accessibility.s2.items.contrast")}</li>
          <li>{t("legal.accessibility.s2.items.labels")}</li>
          <li>{t("legal.accessibility.s2.items.semantic")}</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("legal.accessibility.s3.title")}</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t("legal.accessibility.s3.items.dnd")}</li>
          <li>{t("legal.accessibility.s3.items.pdf")}</li>
          <li>{t("legal.accessibility.s3.items.maps")}</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("legal.accessibility.s4.title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("legal.accessibility.s4.body")}
        </p>
      </section>
    </main>
  );
}

