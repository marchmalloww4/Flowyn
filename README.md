# Flowyn

Flowyn is a local-first, agentic business automation platform. It is designed to become a visual system where triggers, brand knowledge, AI agents, tools, decisions, approvals, and actions work together.

This repository currently contains **Milestones 1, 2, 3, 4, 5, and 6**:

- Next.js App Router with strict TypeScript.
- Tailwind CSS v4 and shadcn/ui-compatible primitives.
- PostgreSQL schema and Drizzle migrations for users, workspaces, memberships, brands, brand voice data, and audit logs.
- Better Auth email/password authentication.
- Server-side workspace authorization, role-aware membership management, workspace CRUD, and brand CRUD APIs.
- Uppercase `OWNER`, `ADMIN`, and `MEMBER` roles with tenant-scoped authorization and mutation audit events.
- Provider-agnostic AI generation with trusted configuration, native Ollama streaming, structured output validation, and workspace-scoped generation logs.
- Verified local `nomic-embed-text` embeddings, PostgreSQL pgvector knowledge chunks, deterministic indexing, semantic retrieval, bounded BrandContext, and optional RAG generation.
- Redis and Ollama provisioned through Docker Compose.
- A provider-abstracted Ollama health and generation API.
- Controlled synchronous agents with soft-deleted definitions, bounded decisions, trusted runtime context, an allowlisted tool registry, safe run history, and request cancellation propagation.
- Durable versioned workflows with bounded JSON graph steps, PostgreSQL snapshots and outbox delivery, BullMQ execution, leases, stale-worker protection, durable cancellation, and safe run history.
- Vitest coverage for health probes, schema contracts, input validation, workspace isolation, Ollama behavior, agent policy, runner boundaries, protected APIs, and safe persistence.

Scheduling, webhooks, approvals, integrations, billing, visual canvas editing, and general DAG or loop orchestration remain outside Milestone 6 and are intentionally deferred.

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

Workspace, brand, agent, and run APIs are protected by the authenticated session. All workspace-owned reads and writes verify server-side membership and role. Agent runs are synchronous: `POST /api/agents/:id/runs` returns only after a terminal result, and cancellation is request-scoped rather than durable across requests.

For full setup and troubleshooting, see [SETUP.md](SETUP.md). For architecture decisions, see [ARCHITECTURE.md](ARCHITECTURE.md).

The Compose worker service is independently startable and consumes durable workflow jobs. It uses the same application image, a separate BullMQ Redis connection, and a Redis heartbeat checked by npm run worker:health.

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

Workflow endpoints are /api/workflows, /api/workflows/:id/runs, /api/workflow-runs/:id, and /api/workflow-runs/:id/cancel.

- `/api/health`
- `/api/health/postgres`
- `/api/health/redis`
- `/api/health/ollama`
- `/api/ai/health`
- `/api/knowledge`
- `/api/knowledge/retrieve`
- `/api/agents?workspaceId=...`
- `/api/agent-runs/:id`

Milestone 6 adds lib/workflows for immutable definitions, graph validation, queue/outbox dispatch, executors, leases, and worker lifecycle, plus lib/queue for BullMQ Redis connections. Docker Compose now includes app and worker services.

## Project structure

```text
app/                 Next.js pages and route handlers
components/          UI primitives and dashboard management panels
lib/auth/            Better Auth and server session helpers
lib/brands/          Brand validation and service layer
lib/database/        Drizzle client, schema, migration, and seed
lib/health/          PostgreSQL, Redis, and Ollama probes
lib/ai/              LLM provider contract and Ollama implementation
lib/embeddings/      Verified-dimension embedding provider and errors
lib/knowledge/       Chunking, indexing, retrieval, and BrandContext services
lib/agents/          Bounded runner, trusted tool registry, agent service, and safe run persistence
db/migrations/       Generated PostgreSQL migrations
tests/               Vitest tests
scripts/             Local verification helpers
docker-compose.yml   Local PostgreSQL, Redis, Ollama, app, and worker services
```

## License

This project is currently an internal development project.
