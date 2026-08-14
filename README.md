# Flowyn

Flowyn is a local-first, agentic business automation platform. It is designed to become a visual system where triggers, brand knowledge, AI agents, tools, decisions, approvals, and actions work together.

This repository currently contains **Milestones 1 through 12**:

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
- Durable CRON, interval, and one-time workflow schedules with PostgreSQL occurrence uniqueness, bounded misfire handling, a dedicated scheduler process, Redis heartbeat health, and workspace-scoped schedule history.
- Secure inbound workflow webhooks with encrypted rotatable secrets, HMAC/timestamp verification, Redis admission limits, PostgreSQL delivery deduplication, durable event/run/outbox transactions, safe delivery history, and a workspace-isolated management panel.
- Durable human approval gates with a static APPROVAL workflow step, PostgreSQL-owned waiting/decision/expiration/cancellation state, protected workspace approval inbox APIs, safe bounded approval context, and generation-aware workflow continuation dispatch.
- A server-validated visual workflow editor that projects the existing seven-step workflow definition into a React Flow canvas, persists layout separately, supports Advanced JSON round-tripping, and rejects stale saves with optimistic `currentVersionId` concurrency.
- A workspace-isolated encrypted integration credential vault, static Slack `post_message` connector, fixed-target bounded egress, approval-aware `INTEGRATION_ACTION` workflow step, PostgreSQL-authoritative idempotent action state, safe recovery semantics, and protected credential-management APIs.
- Production hardening with server-resolved SELF_HOSTED usage limits, PostgreSQL-authoritative quota admission and concurrency leases, bounded Redis rate limiting, workflow dispatch deferral, correlation-safe structured logging, readiness diagnostics, bounded retention cleanup, workspace operations projections, and production configuration validation.
- Vitest coverage for health probes, schema contracts, input validation, workspace isolation, Ollama behavior, agent policy, runner boundaries, protected APIs, and safe persistence.

OAuth, generic HTTP, arbitrary outbound targets, billing, browser automation, file uploads, and general DAG or loop orchestration remain outside Milestone 12 and are intentionally deferred.

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

The Compose worker service is independently startable and consumes durable workflow jobs. The scheduler service uses the same application image, PostgreSQL schedule truth, and a Redis heartbeat checked by npm run scheduler:health. No schedule truth is stored in BullMQ repeatable jobs.

Schedule APIs are available at `/api/workflow-schedules`, `/api/workflow-schedules/:id`, and `/api/workflow-schedules/:id/occurrences`; schedule mutation requires workspace ADMIN or OWNER access, while members can read schedules and history.

Webhook management APIs are available at `/api/workflow-webhooks` and its resource, enable/disable, secret-rotation, and event-history routes. Public delivery uses `POST /api/hooks/:publicId` with the documented HMAC headers. Management mutation requires workspace ADMIN or OWNER access; members can read safe configuration and history. The public route never accepts workspace, user, workflow, role, principal, tool, model, endpoint, or execution choices from the sender.

Approval APIs are available at `/api/workflow-approvals`, `/api/workflow-approvals/:id`, `/api/workflow-approvals/:id/approve`, and `/api/workflow-approvals/:id/reject`. Members can read safe approval projections; only currently authorized ADMIN or OWNER users can decide according to the immutable step policy. Automation principals, AI, agents, webhook callers, and workflow input cannot decide approvals.

Integration APIs are available at `/api/integrations/catalog` and `/api/integration-credentials` with its resource and rotation routes. OWNER and ADMIN users can manage workspace-scoped Slack credentials; MEMBER users can read safe metadata only. Secrets are encrypted server-side, returned in no safe projection, and never enter workflow definitions, queues, AI/agent context, audit metadata, or logs. Real Slack egress is disabled by default and accepts only the static `slack.chat.post_message` target.

Workflow editing uses the existing `/api/workflows/:id` GET/PATCH routes. GET returns the current executable definition, version token, and compatible metadata-only layout. Definition or layout saves include `expectedVersionId`; a stale token returns `WORKFLOW_VERSION_CONFLICT` with HTTP 409. The dashboard Canvas view supports the seven registered steps, including the fixed Slack action configuration, while Advanced JSON uses the same definition serializer and server validation path.

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
- `/api/health/ready`
- `/api/ai/health`
- `/api/knowledge`
- `/api/knowledge/retrieve`
- `/api/agents?workspaceId=...`
- `/api/agent-runs/:id`
- `/api/workspaces/:id/usage`
- `/api/workspaces/:id/operations`

The scheduler supports five-field CRON expressions, IANA timezones, intervals from `SCHEDULE_MIN_INTERVAL_SECONDS` through `SCHEDULE_MAX_INTERVAL_SECONDS`, and RFC3339 one-time instants. `SKIP` and `FIRE_ONCE` misfires are bounded by `SCHEDULE_MISFIRE_GRACE_SECONDS`.

Milestones 6 and 7 add lib/workflows for immutable definitions, graph validation, queue/outbox dispatch, executors, leases, worker lifecycle, and schedule-triggered execution, plus lib/queue for BullMQ Redis connections. Docker Compose includes app, worker, and scheduler services.

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
lib/schedules/       Schedule validation/calculation, occurrence processing, scheduler runtime, and heartbeat
lib/webhooks/        HMAC protocol, encrypted secrets, bounded ingress, deduplication, rate limiting, management, and safe history
lib/workflows/       Immutable workflow definitions, static executors, durable runs/outbox, schedules, webhooks, human approval gates, integration actions, and editor projection/concurrency
lib/integrations/    Static connector catalog, encrypted credential lifecycle, fixed Slack egress, and durable action state
db/migrations/       Generated PostgreSQL migrations
tests/               Vitest tests
scripts/             Local verification helpers
docker-compose.yml   Local PostgreSQL, Redis, Ollama, app, worker, and scheduler services
```

## License

This project is currently an internal development project.
