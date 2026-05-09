import { FlatCompat } from "@eslint/eslintrc";

// ESLint v9 uses "flat config". Next.js still documents eslintrc-style extends,
// so we bridge via FlatCompat for a stable, non-interactive setup.
const compat = new FlatCompat({
  baseDirectory: import.meta.dirname
});

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/sw.js",
      "public/workbox-*.js",
      "next-env.d.ts",
      "src/types/**"
    ]
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // This is a personal offline-first app; "any" is acceptable for a few
      // interop points (pdfjs, event handlers, Radix callbacks, etc.).
      "@typescript-eslint/no-explicit-any": "off",

      // Some hooks intentionally omit deps to avoid expensive recalcs on iPad.
      "react-hooks/exhaustive-deps": "warn",

      // Flat-config + small config files.
      "import/no-anonymous-default-export": "off"
    }
  }
];

