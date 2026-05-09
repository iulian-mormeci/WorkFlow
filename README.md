# WorkFlow

Offline-first PWA for field technicians (cash register maintenance).

## Dev

1. Copy env

```bash
cp .env.example .env.local
```

2. Install + run

```bash
npm install
npm run dev
```

## Notes (Section 1)

- Auth uses NextAuth v5 Credentials with a simple file-backed user store in `.data/users.json` (dev-friendly). We’ll replace it with a proper DB adapter later.
- PWA is enabled via `next-pwa` for production builds (disabled in `dev`).

