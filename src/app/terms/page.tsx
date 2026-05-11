import { getSiteUrl } from "@/lib/supabase/site-url";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-static";

function contactEmail(): string {
  return process.env.WORKFLOW_SUPPORT_EMAIL_TO?.trim() || "info@workflow.mormeci.it";
}

export default async function TermsPage() {
  const t = await getTranslations();
  const site = getSiteUrl();
  const email = contactEmail();
  const updatedAt = "11 maggio 2026";

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("legal.terms.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("legal.updatedAtSite", { date: updatedAt, site })}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("legal.terms.s1.title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("legal.terms.s1.body")}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("legal.terms.s2.title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("legal.terms.s2.body")}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("legal.terms.s3.title")}</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t("legal.terms.s3.items.allowed")}</li>
          <li>{t("legal.terms.s3.items.security")}</li>
          <li>{t("legal.terms.s3.items.illegal")}</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("legal.terms.s4.title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("legal.terms.s4.body")}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("legal.terms.s5.title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("legal.terms.s5.body")}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("legal.terms.s6.title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("legal.terms.s6.body")}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("legal.terms.s7.title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("legal.terms.s7.body")}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("legal.terms.s8.title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("legal.terms.s8.body")}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("legal.terms.s9.title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("legal.terms.s9.body", { email })}
        </p>
      </section>
    </main>
  );
}

