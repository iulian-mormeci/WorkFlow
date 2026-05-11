import { createNavigation } from "next-intl/navigation";

export const locales = ["it", "en"] as const;
export type Locale = (typeof locales)[number];

/**
 * Locale-aware wrappers for routing primitives.
 *
 * - Default locale (it) has no prefix: `/dashboard`
 * - English is prefixed: `/en/dashboard`
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation({
    locales,
    defaultLocale: "it",
    localePrefix: "as-needed"
  });

