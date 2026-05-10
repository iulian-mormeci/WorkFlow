# WorkFlow

**Offline-first operations for technicians who work in the field—not at a desk.**

WorkFlow is a progressive web app (PWA) for managing interventions, clients, documents, spare parts, and light CRM from phones and tablets. Data lives in **IndexedDB** on the device for instant UX and poor-network tolerance, then **syncs to Supabase** when you are back online.

---

## Screenshots

> Replace these placeholders with real captures under `docs/screenshots/` when you have them.

| Area | Preview |
|------|---------|
| **Dashboard** | ![Dashboard](https://placehold.co/1200x750/0f172a/e2e8f0?text=WorkFlow+%E2%80%94+Dashboard) |
| **Interventions** | ![Interventions](https://placehold.co/1200x750/0f172a/e2e8f0?text=Interventions+%26+timer) |
| **Documents** | ![Documents](https://placehold.co/1200x750/0f172a/e2e8f0?text=Scanner+%26+PDF) |
| **Mobile shell** | ![Mobile](https://placehold.co/750x1334/0f172a/e2e8f0?text=iPhone+shell) |

---

## Key features

| Icon | Feature | What you get |
|:-:|---|---|
| 🛠️ | **Interventions & activities** | Schedule, status, timers, KM, checklists, photos, voice notes |
| 📷 | **Document scanner** | Capture PDFs on-site, attach to visits, send to support when online |
| 🔔 | **Reminders** | Pre-due and due notifications (browser + optional email via Resend) |
| ☁️ | **Multi-device sync** | Supabase + Realtime; merge rules favour recent local edits |
| 📄 | **PDF export** | Printable intervention reports for customers or archives |
| 👥 | **Clients & CRM tickets** | Structured customer data and lightweight ticket tracking |
| 📦 | **Spare parts & stock** | Movements linked to interventions |
| 📋 | **Templates** | Start new visits from repeatable presets |
| 📊 | **Reports & statistics** | Exports and operational visibility |
| 📱 | **PWA install** | Add to Home Screen for an app-like experience |

Italian labels for the same areas: **Interventi** · **Scanner** · **Promemoria** · **Sync** · **PDF** · **Clienti** · **Ricambi** · **Ticket** · **Modelli** · **Report** · **PWA**

---

## Tech stack

| Layer | Choice |
|--------|--------|
| **Framework** | [Next.js 15](https://nextjs.org/) (App Router) |
| **UI** | React 19, [Tailwind CSS](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/) patterns, Radix primitives |
| **Local DB** | [Dexie](https://dexie.org/) (IndexedDB) |
| **Auth & cloud** | [Supabase](https://supabase.com/) (Auth, Postgres, Storage, Realtime) |
| **Email** | [Resend](https://resend.com/) (optional, for support / reminders) |
| **Maps / geo** | Leaflet, server APIs for geocode / static maps / routes |
| **PWA** | `next-pwa` (production builds) |

---

## Getting started (development)

1. **Clone and install**

   ```bash
   git clone <your-repo-url>
   cd WorkFlowWebApp
   npm install
   ```

2. **Environment**

   ```bash
   cp .env.local.example .env.local
   ```

   Fill in at minimum:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL` (e.g. `http://localhost:3000`)

   Optional but useful in production:

   - `RESEND_API_KEY`, `WORKFLOW_SUPPORT_EMAIL_FROM`, `WORKFLOW_SUPPORT_EMAIL_TO` for outbound mail  
   - `SUPABASE_SERVICE_ROLE_KEY` for privileged server jobs (use sparingly, never in the browser)

3. **Database**

   Apply SQL migrations under `supabase/migrations/` to your Supabase project (Dashboard → SQL Editor, or [Supabase CLI](https://supabase.com/docs/guides/cli)).

4. **Run**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

5. **Production build**

   ```bash
   npm run build
   npm start
   ```

---

## Self-hosting & deployment

- **Hosting**: any Node-friendly platform (Vercel, Fly.io, Railway, Docker on your own VM). Set the same env vars as production; ensure `NEXT_PUBLIC_SITE_URL` matches your public URL (used in auth redirects and emails).
- **Supabase**: create a project, run migrations, enable Auth (email/password or your chosen providers), create a Storage bucket if you use attachment uploads (see app sync constants).
- **HTTPS**: required for PWA, camera, and geolocation in real deployments.
- **Cron / edge**: reminder and support-email routes are HTTP-triggered; wire a scheduler or queue if you need strict SLA beyond the client-driven flows.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Optimised production build (includes PWA assets) |
| `npm run start` | Run production server |
| `npm run lint` | ESLint |

---

## Contributing

1. Open an issue for larger changes so we can align on scope.  
2. Fork → feature branch → PR with a clear description and screenshots for UI work.  
3. Keep PRs focused; run `npm run lint` and `npm run build` before requesting review.  
4. Match existing patterns: Server Components for data that must not leak secrets; `"use client"` only where browser APIs or Dexie hooks require it.

---

## License

This project is released under the [MIT License](./LICENSE).

---

<p align="center">
  <b>WorkFlow</b> — built for technicians who need the app to work when the network does not.
</p>
