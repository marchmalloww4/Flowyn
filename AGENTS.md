# Agent and contributor guidance

## Scope

Implement Milestone 1 only unless the task explicitly changes the milestone. Do not add workflow execution, RAG, agents, queues, scheduling, webhooks, approvals, integrations, or editor functionality as part of foundation work.

## Code organization

- Keep business logic in `lib/*` services.
- Keep route handlers thin: authenticate, validate, call a service, return a typed response.
- Keep React components focused on presentation and user interaction.
- Add a Zod schema for every request body.
- Add a focused Vitest test for each new security or provider behavior.
- Use the `LLMProvider` interface instead of importing Ollama from domain code.

## Required checks

Before considering a change complete:

```powershell
npm run typecheck
npm run lint
npm test -- --run
npm run build
```

If Docker is involved, also run:

```powershell
docker compose config
docker compose up -d --build
docker compose ps
```

Report missing local prerequisites rather than treating skipped commands as passing.

## Database changes

Change `lib/database/schema.ts`, generate a migration with `npm run db:generate`, and review the generated SQL. Do not hand-edit generated migration metadata unless the migration tool requires it. Run migrations against PostgreSQL before relying on a schema change.

## Security rules

Never trust client user IDs or workspace IDs without a server-side membership check. Never return credentials. Never add shell execution to AI context. Keep future tool permissions explicit and deny-by-default.

## Commit style

Use small commits with imperative messages, for example:

- `feat: add local services and dependency health checks`
- `feat: add auth workspaces brands and database foundation`
- `feat: add local Ollama generation`
- `docs: document local setup and verification`