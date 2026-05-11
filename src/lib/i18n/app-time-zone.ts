/**
 * Global IANA time zone for next-intl date/time formatting.
 * Without this, static builds emit IntlErrorCode.ENVIRONMENT_FALLBACK (see next-intl docs: configuration → time zone).
 */
export function getAppTimeZone(): string {
  const tz = process.env.NEXT_PUBLIC_APP_TIME_ZONE?.trim();
  return tz && tz.length > 0 ? tz : "UTC";
}
