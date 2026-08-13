# Flowyn Milestone 1 Foundation Design

## Status

Approved by the user on 2026-08-13.

## Goal

Deliver the first usable, local-first slice of Flowyn, an agentic business automation platform. Milestone 1 is intentionally limited to the foundation needed by later milestones:

`sign up / sign in -> create workspace -> create brand -> request local Ollama generation`

The implementation must be real and runnable locally. It must not return hard-coded AI responses or pretend that future workflow, RAG, queue, or integration features already exist.

## Scope

### Included

- Next.js App Router application using strict TypeScript.
- Tailwind CSS and a small original SaaS shell with auth, workspace, and brand surfaces.
- PostgreSQL running through Docker Compose.
- Redis running through Docker Compose as infrastructure reserved for later BullMQ workers.
- Ollama running through Docker Compose with documented model setup.
- Drizzle ORM schema and SQL migrations for the Milestone 1 entities.
- Better Auth with database-backed sessions and email/password authentication.
- Workspace membership and server-side workspace authorization helpers.
- Workspace creation and listing.
- Brand creation, listing, detail retrieval, and update.
- Brand voice/rules/examples persistence sufficient for future Brand DNA analysis.
- `LLMProvider` abstraction and an Ollama implementation.
- A generation API that calls Ollama and reports useful unavailable-model/setup errors.
- Seed data for a development demo workspace and Acme AI brand, without using seed data as a production response path.
- Unit and integration tests for auth, workspace isolation, brand CRUD, and the Ollama provider contract.
- Setup, architecture, AI, and security documentation for the foundation.

### Explicitly deferred

- React Flow workflow builder and workflow execution engine.
- BullMQ workers, scheduling, webhooks, approvals, and resumable execution.
- Document extraction, embeddings, pgvector, and RAG retrieval.
- Agent tool loop, tool permissions, memory, and agent builder.
- TipTap editor, external integrations, email delivery, and browser research.
- Production deployment, social login, billing, and cloud AI providers.

## Architecture

Flowyn is a modular monolith. The browser talks to Next.js route handlers and server actions. Business operations live in service modules, which depend on repositories/Drizzle and provider interfaces. The provider boundary prevents agent logic from becoming coupled to Ollama.

```text
Browser UI
   |
Next.js App Router + Route Handlers
   |
Auth / Workspace / Brand services ---- LLMProvider
   |                                      |
Drizzle ORM ------------------------ OllamaProvider
   |                                      |
PostgreSQL                         Ollama HTTP API

Redis is started by Compose but has no Milestone 1 worker.
```

The initial directory layout is:

```text
app/                 routes and pages
components/          reusable UI components
lib/auth/             Better Auth configuration and session helpers
lib/database/         Drizzle client and schema
lib/workspaces/       membership and authorization service
lib/brands/           brand service and validation
lib/ai/               provider interfaces and Ollama implementation
lib/security/         secrets, request validation, and safe errors
db/migrations/        generated SQL migrations
tests/                Vitest tests and test helpers
docs/                 setup and system documentation
```

## Data model

Milestone 1 creates these tables:

- `users`: Better Auth user identity.
- `sessions`: Better Auth sessions, with expiry and user ownership.
- `accounts`: Better Auth account/provider records.
- `verifications`: Better Auth verification records.
- `workspaces`: tenant boundary with name, slug, and creator.
- `workspace_members`: user membership and role (`owner`, `admin`, `member`).
- `brands`: workspace-owned brand profile fields, including audience, positioning, value proposition, tone, personality, vocabulary, and formatting preferences.
- `brand_voice_profiles`: structured voice profile JSON and analysis metadata, reserved for the Brand DNA milestone.
- `brand_rules`: preferred/forbidden vocabulary and writing rules.
- `brand_examples`: source examples and explanations.
- `audit_logs`: workspace-scoped security and mutation events.

Every workspace-owned query takes a workspace ID or derives it from an authenticated membership check. Resource IDs are never treated as authorization. Foreign keys and unique constraints prevent duplicate membership and duplicate workspace slugs.

## Authentication and authorization

Better Auth owns user/session/account persistence. Password authentication is enabled for local-first development. Route handlers use a server-side session helper. Workspace services require an authenticated user and verify membership before reading or mutating workspace resources.

The first UI uses a single active workspace selected from the user’s memberships. The active workspace is passed to server operations; no client-provided workspace ID is trusted without membership verification.

Milestone 1 security constraints:

- Validate all request bodies with Zod.
- Keep database and Ollama credentials server-side.
- Never return session secrets or password hashes.
- Do not expose generic database access to the model.
- Do not expose shell execution to agents.
- Limit generation input and output sizes.
- Return structured, non-sensitive errors.

## AI provider contract

```ts
interface LLMProvider {
  generate(input: LLMGenerateInput): Promise<LLMResult>;
  health(): Promise<LLMHealthResult>;
}
```

`OllamaProvider` calls the configured Ollama base URL and model. The default model is configurable through environment variables. The generation route performs provider validation and returns a setup-oriented error if Ollama is offline or the model is missing. No paid provider is called.

Later providers can implement the same interface without changing workspace, brand, agent, or workflow services.

## API surface

Milestone 1 exposes:

- `POST /api/auth/*`: Better Auth handler.
- `GET /api/workspaces`: list memberships/workspaces for the current user.
- `POST /api/workspaces`: create a workspace and owner membership.
- `GET /api/brands`: list brands in an authorized workspace.
- `POST /api/brands`: create a brand in an authorized workspace.
- `GET /api/brands/:id`: retrieve a brand after checking workspace membership.
- `PATCH /api/brands/:id`: update a brand after checking workspace membership.
- `POST /api/ai/generate`: generate text through the configured local provider.
- `GET /api/ai/health`: report local AI readiness without exposing secrets.

All mutation routes return typed JSON and use consistent error envelopes. Future routes can add workflow and agent services without moving existing logic into components.

## UI flow

- Unauthenticated users see sign-in and sign-up forms.
- Authenticated users see a dashboard shell with the active workspace and navigation placeholders for future modules.
- The workspace page lists existing workspaces and creates a new one.
- The brand page lists brands and provides a creation/edit form for the core Brand Overview fields.
- The AI panel accepts a prompt and displays a real Ollama result, loading state, or actionable setup error.

The UI is intentionally useful but not a fake complete dashboard: deferred modules are presented as unavailable or upcoming, not as functioning controls.

## Error handling

- Validation errors return HTTP 400 with field-level details.
- Missing session returns HTTP 401.
- Missing workspace membership or resource access returns HTTP 404 to avoid leaking cross-tenant resource existence.
- Provider unavailable/model missing returns HTTP 503 with a safe error code and setup hint.
- Unexpected errors are logged server-side and return a generic HTTP 500 response.

## Testing strategy

Vitest covers:

- Password sign-up/sign-in session behavior.
- Workspace creation and membership enforcement.
- Cross-workspace brand read/update denial.
- Brand validation and persistence behavior.
- Ollama provider request/response parsing, timeout/error mapping, and missing-model handling.
- Generation route authentication and provider error behavior.

Where a live PostgreSQL/Ollama service is unavailable, tests use isolated fakes at the provider/repository boundary; Docker-backed verification is run separately when services are available. The verification checklist is typecheck, lint, unit/integration tests, migration validation, and application build.

## Operational setup

`docker-compose.yml` starts `app`, `postgres`, `redis`, and `ollama`. The app container is a development-ready Next.js service with environment variables documented in `.env.example`. PostgreSQL data, Redis data, and Ollama model data use named volumes. Setup documentation explains Docker startup, pulling the recommended instruct and embedding models, migration, local app startup, and the localhost URL.

## Decisions

- Drizzle is selected over Prisma to keep SQL migrations explicit and keep the schema close to PostgreSQL/pgvector requirements planned for Milestone 4.
- Better Auth is selected for self-hostable password/session auth and direct database integration.
- Redis is provisioned immediately because it is part of the target local environment, but queue execution is deferred to avoid coupling Milestone 1 to background worker lifecycle.
- The initial brand profile stores structured JSON alongside normalized rules/examples. This supports editable Brand DNA without prematurely modeling every future analysis attribute as a column.
- The first milestone uses route handlers and services rather than server actions for a stable API boundary that future webhook and worker code can reuse.

## Definition of done for this milestone

On a clean local machine with Docker and Node installed, a developer can:

1. Start PostgreSQL, Redis, Ollama, and the app support containers.
2. Apply database migrations.
3. Create an account and sign in.
4. Create a workspace.
5. Create and edit a brand.
6. Send a prompt to the configured Ollama model and receive a real response.
7. Run the automated checks and see failures if the local AI or database prerequisites are misconfigured.

The implementation stops after this slice and reports remaining milestones honestly.
