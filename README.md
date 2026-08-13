# Flowyn

Flowyn is a local-first, agentic business automation platform. It is designed to become a visual system where triggers, brand knowledge, AI agents, tools, decisions, approvals, and actions work together.

This repository currently contains **Milestones 1 and 2**:

- Next.js App Router with strict TypeScript.
- Tailwind CSS v4 and shadcn/ui-compatible primitives.
- PostgreSQL schema and Drizzle migrations for users, workspaces, memberships, brands, brand voice data, and audit logs.
- Better Auth email/password authentication.
- Server-side workspace authorization, role-aware membership management, workspace CRUD, and brand CRUD APIs.
- Uppercase `OWNER`, `ADMIN`, and `MEMBER` roles with tenant-scoped authorization and mutation audit events.
- Redis and Ollama provisioned through Docker Compose.
- A provider-abstracted Ollama health and generation API.
- Vitest coverage for health probes, schema contracts, input validation, workspace isolation, and Ollama behavior.

Workflow execution, agents, RAG, queues, scheduling, webhooks, approvals, integrations, billing, and the content editor are intentionally not implemented yet. Milestone 3 is the next planned boundary.

## Quick start

1. Install Node.js 20.9+ and Docker Desktop.
2. Copy `.env.example` to `.env.local` and change `BETTER_AUTH_SECRET`.
3. Install dependencies with `npm install`.
4. Start local infrastructure with `docker compose up -d`.
5. Pull the local models:

   ```powershell
   docker compose exec ollama ollama pull llama3.2:3b
   docker compose exec ollama ollama pull nomic-embed-text
   ```

6. Apply the schema from the app container:

   ```powershell
   docker compose exec app npm run db:migrate
   ```

7. Start the host app with `npm run dev`.
8. Open [http://localhost:3000](http://localhost:3000).

Workspace and membership APIs are protected by the authenticated session. All workspace-owned reads and writes verify server-side membership and role.

For full setup and troubleshooting, see [SETUP.md](SETUP.md). For architecture decisions, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Verification

Run the local static checks:

```powershell
npm run typecheck
npm run lint
npm test -- --run
npm run build
```

When Docker Desktop is installed, run the complete local verification script:

```powershell
.\scripts\verify-local.ps1
```

The health endpoints are:

- `/api/health`
- `/api/health/postgres`
- `/api/health/redis`
- `/api/health/ollama`
- `/api/ai/health`

## Project structure

```text
app/                 Next.js pages and route handlers
components/          UI primitives and Milestone 1 forms
lib/auth/            Better Auth and server session helpers
lib/brands/          Brand validation and service layer
lib/database/        Drizzle client, schema, migration, and seed
lib/health/          PostgreSQL, Redis, and Ollama probes
lib/ai/              LLM provider contract and Ollama implementation
db/migrations/       Generated PostgreSQL migrations
tests/               Vitest tests
scripts/             Local verification helpers
docker-compose.yml   Local PostgreSQL, Redis, Ollama, and app services
```

## License

This project is currently an internal development project.
