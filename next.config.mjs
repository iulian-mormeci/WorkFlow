import nextPWA from "next-pwa";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const withPWA = nextPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  cleanupOutdatedCaches: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [
    {
      urlPattern: ({ request }) =>
        request.destination === "script" ||
        request.destination === "style",
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "workflow-app-shell-v2",
        expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 }
      }
    },
    {
      urlPattern: ({ request }) => request.destination === "image",
      handler: "CacheFirst",
      options: {
        cacheName: "workflow-images-v2",
        expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 }
      }
    }
  ]
});

const isProd = process.env.NODE_ENV === "production";

/**
 * Level 1 security headers (defense in depth). Middleware adds the same baseline
 * on dynamic responses; CSP is defined here so `_next/static` is covered.
 *
 * HSTS `preload` + `includeSubDomains`: only enable in production over HTTPS.
 * Before requesting browser preload list inclusion, verify all subdomains serve HTTPS.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://unpkg.com https://staticmap.openstreetmap.de https://maps.googleapis.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' blob: data:",
  "child-src 'self' blob:"
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /**
   * Quiet non-actionable webpack noise so production builds stay clean:
   *  - next-intl's production extractor uses a dynamic `import(t)` webpack can't
   *    statically parse ("Build dependencies behind this expression are ignored").
   *  - The webpack persistent cache logs "Serializing big strings" for our large
   *    i18n message bundles (messages/*.json). Both are infra-logging warnings
   *    (the `<w>` prefix), so we raise the infra log level to `error` and also add
   *    `ignoreWarnings` as a safety net for any compilation-level variant.
   * This is purely logging configuration — runtime behavior is unchanged.
   */
  webpack: (config) => {
    // This runs after next-intl / next-pwa have applied their own webpack tweaks
    // (both plugins invoke the user `webpack` last), so we only adjust logging here.
    config.infrastructureLogging = {
      ...config.infrastructureLogging,
      level: "error"
    };
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /next-intl[\\/].*[\\/]extractor[\\/]format[\\/]index\.js/ },
      /Parsing of .* for build dependencies failed/,
      /Serializing big strings/
    ];
    return config;
  },
  async headers() {
    const base = [
      { key: "X-DNS-Prefetch-Control", value: "off" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value:
          "accelerometer=(), autoplay=(), camera=(), encrypted-media=(), fullscreen=(self), geolocation=(self), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()"
      },
      { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY }
    ];
    if (isProd) {
      base.unshift({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload"
      });
    }
    return [
      {
        source: "/:path*",
        headers: base
      }
    ];
  }
};

export default withPWA(withNextIntl(nextConfig));

