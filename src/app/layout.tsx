/**
 * Root layout: global providers, sync runner, toast host.
 * Auth-sensitive UI lives under `(protected)`; this shell stays lean for every route.
 */
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import "./globals.css";
import { SupabaseProvider } from "@/components/supabase/supabase-provider";
import { WorkflowSyncRunner } from "@/components/sync/workflow-sync-runner";
import { Toaster } from "@/components/ui/toaster";
import { SupportEmailOutboxAutoFlush } from "@/components/support/support-email-outbox-autoflush";
import { LegalFooter } from "@/components/legal/legal-footer";
import { CookieConsentBanner } from "@/components/legal/cookie-consent-banner";

export const metadata: Metadata = {
  title: "WorkFlow",
  description: "Offline-first maintenance PWA for field technicians",
  applicationName: "WorkFlow",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "WorkFlow"
  },
  formatDetection: { telephone: false }
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

const NEXT_INTL_LOCALE_HEADER = "X-NEXT-INTL-LOCALE";

/** Wraps all pages with Supabase context, background sync, and toaster. */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  // Must match `src/middleware.ts`: next-intl and RSC read `X-NEXT-INTL-LOCALE` on the forwarded request.
  const fromIntl = h.get(NEXT_INTL_LOCALE_HEADER) ?? h.get("x-workflow-locale");
  const locale = (fromIntl === "en" ? "en" : "it") as "it" | "en";
  setRequestLocale(locale);
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <SupabaseProvider>
            <WorkflowSyncRunner />
            <div className="flex min-h-dvh flex-col">
              <div className="flex-1">{children}</div>
              <LegalFooter />
            </div>
            <CookieConsentBanner />
            <SupportEmailOutboxAutoFlush />
            <Toaster />
          </SupabaseProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

