import { getSiteUrl } from "@/lib/supabase/site-url";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-static";

function contactEmail(): string {
  // Keep a stable contact in production; fallback is fine for a personal tool.
  return process.env.WORKFLOW_SUPPORT_EMAIL_TO?.trim() || "info@workflow.mormeci.it";
}

export default async function PrivacyPage() {
  const t = await getTranslations();
  const site = getSiteUrl();
  const email = contactEmail();
  const updatedAt = "11 maggio 2026";

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t("legal.privacy.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("legal.updatedAtSite", { date: updatedAt, site })}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("legal.privacy.s1.title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("legal.privacy.s1.body", { email })}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("legal.privacy.s2.title")}</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t("legal.privacy.s2.items.account")}</li>
          <li>{t("legal.privacy.s2.items.operational")}</li>
          <li>{t("legal.privacy.s2.items.technical")}</li>
          <li>{t("legal.privacy.s2.items.cookies")}</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("legal.privacy.s3.title")}</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t("legal.privacy.s3.items.auth")}</li>
          <li>{t("legal.privacy.s3.items.manage")}</li>
          <li>{t("legal.privacy.s3.items.sync")}</li>
          <li>{t("legal.privacy.s3.items.email")}</li>
          <li>{t("legal.privacy.s3.items.security")}</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("legal.privacy.s4.title")}</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t("legal.privacy.s4.items.contract")}</li>
          <li>{t("legal.privacy.s4.items.legitimate")}</li>
          <li>{t("legal.privacy.s4.items.consent")}</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("legal.privacy.s5.title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("legal.privacy.s5.p1")}
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("legal.privacy.s5.p2")}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("legal.privacy.s6.title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("legal.privacy.s6.p1")}
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t("legal.privacy.s6.items.supabase")}</li>
          <li>{t("legal.privacy.s6.items.resend")}</li>
        </ul>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("legal.privacy.s6.p2")}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("legal.privacy.s7.title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("legal.privacy.s7.body")}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("legal.privacy.s8.title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("legal.privacy.s8.p1")}
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t("legal.privacy.s8.items.settingsRights")}</li>
          <li>{t("legal.privacy.s8.items.email", { email })}</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("legal.privacy.s9.title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("legal.privacy.s9.body")}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("legal.privacy.s10.title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("legal.privacy.s10.body", { email })}
        </p>
      </section>
    </main>
  );
}

