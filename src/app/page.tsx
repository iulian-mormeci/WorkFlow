import { Link } from "@/i18n/navigation";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Camera,
  CheckCircle2,
  Cloud,
  FileText,
  LayoutTemplate,
  MapPin,
  Package,
  Shield,
  Sparkles,
  Ticket,
  Timer,
  Users,
  Wrench
} from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations();
  return {
    title: t("landing.metaTitle"),
    description: t("landing.metaDescription")
  };
}

const features = [
  {
    icon: Wrench,
    key: "landing.features.interventions"
  },
  {
    icon: Camera,
    key: "landing.features.scanner"
  },
  {
    icon: Bell,
    key: "landing.features.reminders"
  },
  {
    icon: Cloud,
    key: "landing.features.sync"
  },
  {
    icon: FileText,
    key: "landing.features.pdf"
  },
  {
    icon: Users,
    key: "landing.features.clients"
  },
  {
    icon: Package,
    key: "landing.features.stock"
  },
  {
    icon: Ticket,
    key: "landing.features.tickets"
  },
  {
    icon: LayoutTemplate,
    key: "landing.features.templates"
  },
  {
    icon: BarChart3,
    key: "landing.features.reports"
  }
] as const;

const testimonials = [
  {
    key: "landing.testimonials.one"
  },
  {
    key: "landing.testimonials.two"
  },
  {
    key: "landing.testimonials.three"
  }
] as const;

/**
 * Public marketing home: Italian-first positioning for field technicians.
 * Authenticated users still see the page with a clear shortcut to the app shell.
 */
export default async function HomePage() {
  const t = await getTranslations();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Wrench className="h-4 w-4" aria-hidden />
            </span>
            <span className="text-base sm:text-lg">{t("common.appName")}</span>
          </Link>
          <nav className="flex shrink-0 items-center gap-2 sm:gap-3">
            {user ? (
              <>
                <span className="hidden max-w-[140px] truncate text-xs text-muted-foreground sm:inline">
                  {user.email}
                </span>
                <Button asChild size="sm" className="rounded-xl sm:h-10 sm:px-4">
                  <Link href="/dashboard">
                    {t("common.openApp")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" asChild size="sm" className="rounded-xl sm:h-10">
                  <Link href="/login">{t("common.signIn")}</Link>
                </Button>
                <Button asChild size="sm" className="rounded-xl sm:h-10 sm:px-4">
                  <Link href="/register">{t("common.signUp")}</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b">
          <div
            className={cn(
              "pointer-events-none absolute inset-0 opacity-40",
              "bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,hsl(var(--primary)/0.25),transparent_55%)]"
            )}
            aria-hidden
          />
          <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:pt-20">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
                {t("landing.badge")}
              </div>
              <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                {t("landing.heroTitle")}
              </h1>
              <p className="mt-5 text-pretty text-base text-muted-foreground sm:text-lg">
                {t("landing.heroBody")}
              </p>
              <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                {user ? (
                  <Button asChild size="lg" className="h-12 rounded-2xl px-8 text-base">
                    <Link href="/dashboard">
                      {t("landing.ctaDashboard")}
                      <ArrowRight className="h-5 w-5" />
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Button asChild size="lg" className="h-12 rounded-2xl px-8 text-base">
                      <Link href="/register">
                        {t("landing.ctaPrimary")}
                        <ArrowRight className="h-5 w-5" />
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="lg" className="h-12 rounded-2xl px-8 text-base">
                      <Link href="/login">{t("landing.ctaSecondary")}</Link>
                    </Button>
                  </>
                )}
              </div>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-primary" aria-hidden />
                  {t("landing.pillAuth")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-primary" aria-hidden />
                  {t("landing.pillMaps")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Timer className="h-4 w-4 text-primary" aria-hidden />
                  {t("landing.pillTimer")}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Value props */}
        <section className="border-b bg-muted/30 py-14 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-8 md:grid-cols-3">
              {[
                {
                  title: t("landing.value1Title"),
                  text: t("landing.value1Body")
                },
                {
                  title: t("landing.value2Title"),
                  text: t("landing.value2Body")
                },
                {
                  title: t("landing.value3Title"),
                  text: t("landing.value3Body")
                }
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border bg-background p-6 shadow-sm">
                  <h2 className="text-lg font-semibold tracking-tight">{item.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature grid */}
        <section className="py-14 sm:py-20" id="funzionalita">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("landing.featuresTitle")}</h2>
              <p className="mt-3 text-sm text-muted-foreground sm:text-base">
                {t("landing.featuresSubtitle")}
              </p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, key }) => (
                <Card
                  key={key}
                  className="rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md"
                >
                  <CardHeader className="pb-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                      <Icon className="h-5 w-5 text-primary" aria-hidden />
                    </div>
                    <CardTitle className="text-base font-semibold">{t(`${key}.title`)}</CardTitle>
                  </CardHeader>
                  <div className="px-5 pb-5 pt-0 md:px-6 md:pb-6">
                    <CardDescription className="text-sm leading-relaxed">{t(`${key}.body`)}</CardDescription>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="border-y bg-muted/25 py-14 sm:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">{t("landing.testimonialsTitle")}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-muted-foreground sm:text-base">
              {t("landing.testimonialsSubtitle")}
            </p>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {testimonials.map((x, i) => (
                <Card key={i} className="rounded-2xl border bg-background shadow-sm">
                  <div className="p-5 pt-6 md:p-6">
                    <CheckCircle2 className="mb-3 h-5 w-5 text-primary" aria-hidden />
                    <blockquote className="text-sm leading-relaxed text-foreground">
                      &ldquo;{t(`${x.key}.quote`)}&rdquo;
                    </blockquote>
                    <footer className="mt-4 text-xs font-medium text-muted-foreground">{t(`${x.key}.role`)}</footer>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("landing.ctaTitle")}</h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              {t("landing.ctaBody")}
            </p>
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              {user ? (
                <Button asChild size="lg" className="h-12 rounded-2xl px-8 text-base">
                  <Link href="/dashboard">{t("landing.ctaOpenApp")}</Link>
                </Button>
              ) : (
                <>
                  <Button asChild size="lg" className="h-12 rounded-2xl px-8 text-base">
                    <Link href="/register">{t("common.signUp")}</Link>
                  </Button>
                  <Button asChild variant="outline" size="lg" className="h-12 rounded-2xl px-8 text-base">
                    <Link href="/login">{t("common.signIn")}</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t bg-muted/20 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-center text-xs text-muted-foreground sm:flex-row sm:px-6 sm:text-left">
          <p>{t("landing.footer.copyright", { year: new Date().getFullYear() })}</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/login" className="underline-offset-4 hover:underline">
              {t("common.signIn")}
            </Link>
            <Link href="/register" className="underline-offset-4 hover:underline">
              {t("common.signUp")}
            </Link>
            {user ? (
              <Link href="/dashboard" className="underline-offset-4 hover:underline">
                {t("nav.dashboard")}
              </Link>
            ) : null}
          </div>
        </div>
      </footer>
    </div>
  );
}
