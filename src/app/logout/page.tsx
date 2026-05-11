import { Link } from "@/i18n/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";

/** Post-sign-out message page (optional UX). Must be a Server Component — no hooks here. */
export default async function LogoutPage() {
  const t = await getTranslations();
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div className="rounded-2xl border bg-muted/20 p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-background">
            <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-balance text-xl font-semibold tracking-tight sm:text-2xl">
              {t("logout.title")}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t("logout.body")}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button asChild size="lg" className="h-12 rounded-2xl px-6 text-base">
            <Link href="/">
              {t("common.backToHome")}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-12 rounded-2xl px-6 text-base">
            <Link href="/login">{t("logout.signIn")}</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
