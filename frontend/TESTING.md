# Frontend E2E Testing

The frontend uses Playwright for browser-level checks. The Playwright suite starts the backend with `npm run start:test`, starts Vite, and resets the same dedicated MySQL test database before each test.

## Setup

1. Configure `backend/.env.test` from `backend/.env.test.example`.
2. Install frontend dependencies.
3. Install Playwright browser binaries:

```bash
cd frontend
npx playwright install
```

## Commands

```bash
cd frontend
npm run e2e
npm run e2e:headed
npm run e2e:ui
```

## Current Coverage

- Shop login -> role login -> dashboard
- Owner product creation
- Staff cash POS sale
- Staff permission block on a restricted page

## Pending Browser Tests

- Full payment verification approve/fail workflow
- More detailed product edit/delete flows
- Mobile viewport navigation and POS checkout checks
- Owner-only payment verification page behavior
