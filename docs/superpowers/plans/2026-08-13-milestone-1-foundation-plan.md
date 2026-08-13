# Milestone 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify the local-first Flowyn foundation: Next.js application, Tailwind/shadcn-style UI primitives, Docker Compose services, PostgreSQL/Redis/Ollama health checks, environment configuration, approved Milestone 1 auth/workspace/brand/local-generation slice, tests, and documentation.

**Architecture:** Use a modular Next.js App Router monolith. Route handlers call small server-side services; Drizzle owns PostgreSQL access; Better Auth owns sessions; Ollama is accessed only through an `LLMProvider` interface. Docker Compose provides `app`, `postgres`, `redis`, and `ollama` services with named volumes.

**Tech Stack:** Next.js, React, TypeScript strict mode, Tailwind CSS, shadcn/ui-compatible Radix primitives, Drizzle ORM, PostgreSQL, Redis, Ollama, Better Auth, Zod, Vitest, ESLint.

**Spec:** `docs/superpowers/specs/2026-08-13-milestone-1-foundation-design.md`

## Global Constraints

- Implement Milestone 1 only; do not build workflow execution, RAG, agents, queues, scheduling, webhooks, approvals, editor, integrations, or later milestones.
- Keep the app local-first; no paid AI provider or hard-coded generation response.
- Enforce workspace membership on every workspace-owned server operation.
- Keep secrets server-side and validate request bodies with Zod.
- Keep business logic out of React components.
- Do not expose shell execution or arbitrary database access to the model.
- Use `apply_patch` for source and documentation edits.
- Verify with typecheck, lint, tests, and Docker-backed health checks where the local environment supports them; report unavailable prerequisites honestly.

## File Map

- `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`: project tooling.
- `.env.example`, `.gitignore`: local configuration and safe defaults.
- `docker-compose.yml`, `docker/app.Dockerfile`, `docker/ollama/entrypoint.sh`: local infrastructure.
- `app/layout.tsx`, `app/page.tsx`, `app/(auth)/*`, `app/(dashboard)/*`: app shell and Milestone 1 screens.
- `app/api/health/*`, `app/api/auth/[...all]/route.ts`, `app/api/workspaces/route.ts`, `app/api/brands/route.ts`, `app/api/brands/[id]/route.ts`, `app/api/ai/*`: HTTP APIs.
- `components/ui/*`, `components/flowyn-shell.tsx`, `components/forms/*`: reusable UI and forms.
- `lib/env.ts`, `lib/http.ts`, `lib/security/*`: validated configuration and safe HTTP helpers.
- `lib/database/*`, `db/migrations/*`, `drizzle.config.ts`: Drizzle client, schema, and migrations.
- `lib/auth/*`, `lib/workspaces/*`, `lib/brands/*`: authentication and domain services.
- `lib/ai/*`: provider contract, Ollama implementation, and generation service.
- `tests/*`: unit and route/service tests.
- `README.md`, `SETUP.md`, `ARCHITECTURE.md`, `AI.md`, `SECURITY.md`, `AGENTS.md`: project documentation.

### Task 1: Scaffold the Next.js application and local configuration

**Files:**
- Create: `package.json`, `tsconfig.json`, `next-env.d.ts`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`
- Create: `.env.example`, `.gitignore`
- Create: `app/layout.tsx`, `app/globals.css`, `app/page.tsx`
- Create: `components/ui/button.tsx`, `components/ui/input.tsx`, `components/ui/label.tsx`, `lib/utils.ts`

**Interfaces:**
- Produces npm scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:watch`, `db:generate`, `db:migrate`, `db:push`, `db:seed`.
- Produces `cn(...inputs: ClassValue[]): string` for shadcn-compatible class composition.

- [ ] **Step 1: Add the package/tooling manifests and strict compiler settings.**

Use Next.js App Router, React, Tailwind v4, Drizzle, Better Auth, Zod, Vitest, and testing utilities. Keep dependencies pinned to semver-compatible current major versions in the manifest and let npm resolve the lockfile.

- [ ] **Step 2: Add the base Tailwind/shadcn visual tokens and primitives.**

Create a light/dark-ready token layer in `app/globals.css` and small accessible Button/Input/Label primitives. Do not add a full component library or future workflow UI.

- [ ] **Step 3: Run the static scaffold checks.**

Run:

```powershell
npm install
npm run typecheck
npm run lint
npm test -- --run
```

Expected: the new app compiles, lint completes, and the initial test runner exits successfully even before feature tests are added.

- [ ] **Step 4: Commit the scaffold.**

```powershell
git add package.json package-lock.json tsconfig.json next-env.d.ts next.config.ts postcss.config.mjs eslint.config.mjs vitest.config.ts .env.example .gitignore app components lib
git commit -m "chore: scaffold Flowyn Next.js foundation"
```

### Task 2: Add Docker Compose services and health endpoints

**Files:**
- Create: `docker-compose.yml`, `docker/app.Dockerfile`, `docker/ollama/entrypoint.sh`
- Create: `app/api/health/route.ts`, `app/api/health/postgres/route.ts`, `app/api/health/redis/route.ts`, `app/api/health/ollama/route.ts`
- Create: `lib/health/*`
- Test: `tests/health.test.ts`

**Interfaces:**
- Produces `GET /api/health` returning `{ status: "ok", service: "flowyn" }`.
- Produces `GET /api/health/postgres`, `/redis`, and `/ollama` with `{ status: "ok" | "error", service, latencyMs?, errorCode? }`.
- Produces `checkPostgres()`, `checkRedis()`, and `checkOllama()` functions that never leak connection strings or credentials.

- [ ] **Step 1: Write health check tests against injected clients/fakes.**

Cover success and failure mapping for each dependency, including an Ollama missing-model response mapped to a setup-oriented error code.

- [ ] **Step 2: Run the focused tests and verify they fail for missing health modules.**

```powershell
npm test -- --run tests/health.test.ts
```

Expected: FAIL because the health check functions are not implemented yet.

- [ ] **Step 3: Implement Compose and health checks.**

Compose must define `app`, `postgres:16-alpine`, `redis:7-alpine`, and `ollama/ollama:latest`, with healthchecks, named volumes, and an app dependency on healthy database/cache services. Ollama health must call `/api/tags` and check the configured model name without downloading models automatically.

- [ ] **Step 4: Run focused tests and inspect the Compose configuration.**

```powershell
npm test -- --run tests/health.test.ts
docker compose config
```

Expected: tests PASS. If Docker is unavailable, record the exact prerequisite failure and continue with non-Docker verification; do not claim Compose started.

- [ ] **Step 5: Commit infrastructure and health checks.**

```powershell
git add docker-compose.yml docker app/api/health lib/health tests/health.test.ts
git commit -m "feat: add local services and dependency health checks"
```

### Task 3: Add PostgreSQL schema, migrations, and database client

**Files:**
- Create: `drizzle.config.ts`, `lib/database/client.ts`, `lib/database/schema.ts`, `lib/database/index.ts`
- Create: `db/migrations/0000_foundation.sql`, `db/migrations/meta/*`
- Create: `lib/database/seed.ts`
- Test: `tests/database-schema.test.ts`

**Interfaces:**
- Produces typed tables for users, sessions, accounts, verifications, workspaces, workspace members, brands, voice profiles, rules, examples, and audit logs.
- Produces `getDatabase()` and `closeDatabase()` for server/test lifecycle.
- Produces `seedDatabase()` that creates a development workspace and Acme AI brand only when explicitly run.

- [ ] **Step 1: Write schema contract tests.**

Assert the schema exports every Milestone 1 table and that workspace-owned tables include a workspace foreign key or are directly scoped through an owned parent.

- [ ] **Step 2: Run the focused test to verify the schema contract initially fails.**

```powershell
npm test -- --run tests/database-schema.test.ts
```

- [ ] **Step 3: Implement the Drizzle schema and migration.**

Use UUID primary keys, UTC timestamps, unique workspace slugs, unique `(workspaceId, userId)` membership, role checks at the application boundary, and JSONB for structured brand voice/preferences. Keep tables compatible with Better Auth’s Drizzle adapter.

- [ ] **Step 4: Generate and validate the migration.**

```powershell
npm run db:generate
npm run db:migrate
npm test -- --run tests/database-schema.test.ts
```

Expected: schema test PASS; migration succeeds against a reachable PostgreSQL instance.

- [ ] **Step 5: Commit the database foundation.**

```powershell
git add drizzle.config.ts lib/database db/migrations tests/database-schema.test.ts package.json
git commit -m "feat: add Milestone 1 PostgreSQL schema"
```

### Task 4: Add authentication, workspace/brand services, and APIs

**Files:**
- Create: `lib/auth/auth.ts`, `lib/auth/session.ts`, `app/api/auth/[...all]/route.ts`
- Create: `lib/workspaces/validation.ts`, `lib/workspaces/service.ts`, `app/api/workspaces/route.ts`
- Create: `lib/brands/validation.ts`, `lib/brands/service.ts`, `app/api/brands/route.ts`, `app/api/brands/[id]/route.ts`
- Create: `lib/http.ts`, `lib/security/errors.ts`
- Test: `tests/workspace-isolation.test.ts`, `tests/brands.test.ts`

**Interfaces:**
- Produces `requireUser()` and `requireWorkspaceMember(workspaceId)` server helpers.
- Produces `createWorkspace(userId, input)`, `listWorkspaces(userId)`, `createBrand(userId, input)`, `listBrands(userId, workspaceId)`, `getBrand(userId, brandId)`, and `updateBrand(userId, brandId, input)`.
- Produces auth endpoints compatible with Better Auth client calls.

- [ ] **Step 1: Write failing isolation tests.**

Use two users and two workspaces in an isolated test database/fake repository. Assert a member of workspace A cannot read or update a brand owned by workspace B, even when the brand ID is known.

- [ ] **Step 2: Run focused isolation tests and verify failure.**

```powershell
npm test -- --run tests/workspace-isolation.test.ts tests/brands.test.ts
```

- [ ] **Step 3: Implement Better Auth and server-side domain services.**

All request bodies use Zod. Unauthorized requests return 401; unauthorized resource access returns 404. Resource handlers must derive user identity from the server session and must not trust a client-supplied user ID.

- [ ] **Step 4: Add the minimal authenticated UI flow.**

Create sign-in/sign-up forms, workspace creation/listing, brand create/edit/listing, and a dashboard shell. Deferred modules must be visibly marked as unavailable/upcoming rather than wired to fake actions.

- [ ] **Step 5: Run tests and commit.**

```powershell
npm test -- --run tests/workspace-isolation.test.ts tests/brands.test.ts
npm run typecheck
npm run lint
git add lib/auth lib/workspaces lib/brands lib/http lib/security app/api/auth app/api/workspaces app/api/brands app/(auth) app/(dashboard) components tests
git commit -m "feat: add auth workspaces and brands"
```

### Task 5: Add the Ollama provider and real generation route

**Files:**
- Create: `lib/ai/types.ts`, `lib/ai/ollama-provider.ts`, `lib/ai/service.ts`
- Create: `app/api/ai/health/route.ts`, `app/api/ai/generate/route.ts`
- Modify: `app/(dashboard)/*` to include the AI panel.
- Test: `tests/ollama-provider.test.ts`, `tests/generation-route.test.ts`

**Interfaces:**
- `LLMProvider.generate(input: LLMGenerateInput): Promise<LLMResult>`.
- `LLMProvider.health(): Promise<LLMHealthResult>`.
- `OllamaProvider` calls `/api/generate` and `/api/tags` using the configured base URL/model.

- [ ] **Step 1: Write provider tests with a mocked local HTTP server.**

Cover request payload shape, parsed response, timeout, unreachable Ollama, and configured-model absence. Assert credentials and base URL are not included in returned errors.

- [ ] **Step 2: Run focused provider tests and verify failure.**

```powershell
npm test -- --run tests/ollama-provider.test.ts tests/generation-route.test.ts
```

- [ ] **Step 3: Implement provider, health route, generation route, and dashboard panel.**

The generation route must authenticate the caller, validate prompt/model parameters, use only the configured provider, and return a real result or a structured 503 setup error. No fallback text is allowed.

- [ ] **Step 4: Run focused tests and static checks.**

```powershell
npm test -- --run tests/ollama-provider.test.ts tests/generation-route.test.ts
npm run typecheck
npm run lint
```

- [ ] **Step 5: Commit the AI boundary.**

```powershell
git add lib/ai app/api/ai app/(dashboard) tests package.json
git commit -m "feat: add local Ollama generation"
```

### Task 6: Write documentation and reproducible verification scripts

**Files:**
- Create/modify: `README.md`, `SETUP.md`, `ARCHITECTURE.md`, `AI.md`, `SECURITY.md`, `AGENTS.md`
- Create: `scripts/verify-local.ps1`

**Interfaces:**
- `scripts/verify-local.ps1` runs Compose config validation, service health polling, migrations, Next.js static checks, and tests; it exits nonzero on any failed check.

- [ ] **Step 1: Document local setup.**

Include Docker installation, `Copy-Item .env.example .env.local`, `docker compose up -d`, Ollama model pull commands, migrations, `npm run dev`, health URLs, and exact known prerequisite failures.

- [ ] **Step 2: Document architecture/security/AI extension points.**

Explain the request flow, workspace isolation, provider abstraction, local model setup, secret handling, and the explicit Milestone 1 boundary.

- [ ] **Step 3: Add the verification script.**

The script must check `docker compose config`, wait for PostgreSQL/Redis/Ollama health, run migrations, then run `npm run typecheck`, `npm run lint`, and `npm test -- --run`. It must not install software silently or claim a service is healthy when its command is unavailable.

- [ ] **Step 4: Commit documentation and verification.**

```powershell
git add README.md SETUP.md ARCHITECTURE.md AI.md SECURITY.md AGENTS.md scripts/verify-local.ps1
git commit -m "docs: document local setup and verification"
```

### Task 7: Run the full Milestone 1 verification gate

**Files:**
- Modify only files needed to fix verified failures.

- [ ] **Step 1: Run all local static checks and tests.**

```powershell
npm run typecheck
npm run lint
npm test -- --run
npm run build
```

- [ ] **Step 2: Run Docker-backed checks when Docker is installed.**

```powershell
docker compose up -d --build
docker compose ps
docker compose exec app npm run db:migrate
docker compose exec app npm test -- --run
```

Verify PostgreSQL, Redis, and Ollama through the health routes and direct container checks. If Docker is not installed, report the exact command-not-found output and leave the Compose files ready for the user to run.

- [ ] **Step 3: Verify the Next.js app starts.**

Run `npm run dev` or `npm run start` after a successful build and request `/api/health`. Confirm the response is HTTP 200.

- [ ] **Step 4: Review scope and final status.**

Confirm no Milestone 2–13 feature was added, `git status` is clean, and the final report lists created files, commands executed, checks passed, checks blocked by environment, and remaining milestones.
