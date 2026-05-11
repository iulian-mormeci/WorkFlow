import { headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

const NEXT_INTL_LOCALE_HEADER = "X-NEXT-INTL-LOCALE";

export default getRequestConfig(async ({ requestLocale }) => {
  let resolved = await requestLocale;
  if (!resolved) {
    try {
      resolved = (await headers()).get(NEXT_INTL_LOCALE_HEADER) ?? undefined;
    } catch {
      /* headers() unavailable (e.g. certain static contexts) */
    }
  }
  const locale = resolved === "en" ? "en" : "it";
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    // Critical production hardening: never crash on a missing key.
    // We log on server and show the key path as a visible fallback.
    onError(error) {
      // Avoid throwing — missing messages should not take the app down.
      // eslint-disable-next-line no-console
      console.warn("[i18n]", error);
    },
    getMessageFallback({ namespace, key }) {
      return namespace ? `${namespace}.${key}` : key;
    }
  };
});

