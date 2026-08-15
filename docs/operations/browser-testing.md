# Browser testing

Milestone 14 uses Playwright for product journeys and axe-core for representative accessibility checks.

## Disposable database

Create a uniquely named temporary PostgreSQL database, apply the existing Drizzle migrations, and set `E2E_DATABASE_URL` before running `npm run test:e2e`. The browser tests may create accounts, workspaces, brands, documents, workflows, schedules, and webhook records. Never run them against the development database. Afterward, drop only the validated temporary database.

The test suite uses synthetic identities and synthetic integration input. It never enables `INTEGRATION_EGRESS_ENABLED`, never supplies a real Slack token, and never asserts on or logs plaintext credentials.

## Coverage contract

- Public landing, sign-in, and sign-up pages have one main landmark, one page heading, keyboard-visible focus, and no horizontal overflow at mobile, tablet, or desktop widths.
- The authenticated shell exposes all twelve product areas with an accessible current-location state and a mobile drawer.
- Workspace selection is visible and changing it clears stale feature state before loading the next workspace.
- Representative authenticated surfaces have explicit loading, empty, safe error, confirmation, and paused/disabled states.
- Workflow editing keeps the server validation and optimistic concurrency contract; the canvas is progressive enhancement over the accessible step list.
- axe-core scans are treated as a signal; any serious or critical violation fails the test.

## Local commands

```powershell
npm run typecheck
npm run lint
npm test -- --run
npm run build
npm run test:e2e
```

Use `E2E_BASE_URL` for an already-running server or `E2E_DATABASE_URL` to let Playwright start a server with a disposable database configuration.
