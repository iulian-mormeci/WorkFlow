"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

const KEY = "wf:cookieNotice.v1";

type Choice = "ack";

function readChoice(): Choice | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "ack" ? "ack" : null;
  } catch {
    return null;
  }
}

function writeChoice(c: Choice) {
  try {
    localStorage.setItem(KEY, c);
  } catch {
    /* ignore */
  }
}

/**
 * Minimal, non-intrusive cookie notice.
 *
 * This app does not use analytics/ads or third-party tracking cookies.
 * We still show an informational banner for transparency and store dismissal locally.
 */
export function CookieConsentBanner() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(readChoice() == null);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] p-3" role="region" aria-label={t("cookie.regionAria")}>
      <div className="mx-auto max-w-4xl rounded-2xl border bg-background/95 p-4 shadow-lg backdrop-blur sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div className="text-sm">
          <div className="font-semibold">{t("cookie.title")}</div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t("cookie.body")}{" "}
            <Link className="underline underline-offset-4" href="/privacy">
              {t("footer.privacy")}
            </Link>
            .
          </p>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:mt-0 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            className="h-11 rounded-xl"
            onClick={() => {
              writeChoice("ack");
              setOpen(false);
            }}
          >
            {t("cookie.cta")}
          </Button>
        </div>
      </div>
    </div>
  );
}

