"use client";

import { NextIntlClientProvider } from "next-intl";

export function IntlProvider({
  locale,
  messages,
  children
}: {
  locale: "it" | "en";
  messages: Record<string, unknown>;
  children: React.ReactNode;
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      onError={(error) => {
        // Never crash the UI due to missing translations in production.
        console.warn("[i18n]", error);
      }}
      getMessageFallback={({ namespace, key }) => (namespace ? `${namespace}.${key}` : key)}
    >
      {children}
    </NextIntlClientProvider>
  );
}

