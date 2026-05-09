import nextPWA from "next-pwa";

const withPWA = nextPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [
    {
      urlPattern: ({ request }) =>
        request.destination === "document" ||
        request.destination === "script" ||
        request.destination === "style",
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "workflow-app-shell",
        expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 60 * 60 }
      }
    },
    {
      urlPattern: ({ request }) => request.destination === "image",
      handler: "CacheFirst",
      options: {
        cacheName: "workflow-images",
        expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 }
      }
    }
  ]
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true
};

export default withPWA(nextConfig);

