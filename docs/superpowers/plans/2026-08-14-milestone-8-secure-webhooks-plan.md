# Milestone 8 Secure Webhooks Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with test-first development. Use the approved design specification as the source of truth. Keep the current checkout in place, preserve M1–M7, and do not push.

**Goal:** Implement secure, workspace-isolated inbound webhooks that authenticate external requests with HMAC, persist deduplicated events durably, create existing workflow runs through the transactional outbox, and expose safe management/history UI without adding outbound integrations or arbitrary execution.

**Architecture:** PostgreSQL remains authoritative for triggers, event deduplication, workflow runs, and outbox durability. Redis provides bounded global/per-trigger admission limiting and is fail-closed for public ingress. A public route performs bounded raw-body verification and commits an event plus existing automation run/outbox in one transaction. The existing dispatcher, BullMQ worker, workflow registry, AgentRunner, RAG, LLMProvider, leases, retries, and cancellation execute the run. The existing workspace automation principal gains a webhook origin; no fake Better Auth user is created.

**Spec:** [docs/superpowers/specs/2026-08-14-milestone-8-secure-webhooks-design.md](C:/Users/User/OneDrive/Flowyn/docs/superpowers/specs/2026-08-14-milestone-8-secure-webhooks-design.md)

## Global constraints

- Implement Milestone 8 only. Do not start Milestone 9.
- Preserve all Milestones 1–7 behavior, existing Docker volumes, and development data.
- Do not reset PostgreSQL, Redis, or Ollama.
- Do not add arbitrary shell, SQL, filesystem, code, `eval`, `Function`, dynamic executable modules, unrestricted HTTP, browser automation, or new agent/workflow engines.
- Do not accept workspace IDs, user IDs, workflow IDs, roles, principals, tools, model choices, or endpoints from an unauthenticated webhook request.
- Keep Better Auth, centralized authorization, PostgreSQL, Redis/BullMQ, transactional outbox, scheduler, LLMProvider, RAG, AgentRunner, and workflow registry boundaries authoritative.
- Keep route handlers thin and put domain logic in `lib/*` services.
- Every request body has a strict Zod schema.
- Use Node built-in crypto; do not upgrade unrelated dependencies.
- Use generated and reviewed Drizzle migrations; never reset the database.
- Use TDD: add a focused failing test before each production behavior.
- Do not run `npm audit fix --force`.
- Do not push. A local implementation commit is allowed after verification.

## Task 1: Define webhook contracts, security configuration, and pure protocol policy

Write tests first. Keep these modules independent of Next.js routes and database clients where possible.

Files to create or update:

- Create `lib/webhooks/types.ts` for trigger/event status, safe projections, protocol results, and dedupe contracts.
- Create `lib/webhooks/policy.ts` for all body, header, ID, name, replay, rate, retention, and history bounds.
- Create `lib/webhooks/validation.ts` for strict management schemas and bounded JSON payload validation.
- Create `lib/webhooks/protocol.ts` for timestamp parsing, canonical JSON, payload hashing, event-ID normalization, dedupe-key construction, and the exact signed-message contract.
- Create `lib/env.ts` settings for the webhook encryption key, key version, replay window, body limit, rate limits, retention, and trusted public base URL.
- Update `.env.example` with safe development configuration and instructions for generating a 32-byte base64 encryption key.
- Add focused tests such as `tests/webhook-policy.test.ts`, `tests/webhook-protocol.test.ts`, and `tests/webhook-validation.test.ts`.

Acceptance:

- Timestamp is a canonical Unix-seconds integer and replay boundaries are exact.
- Signature message uses the original raw UTF-8 body bytes, not parsed JSON.
- Event IDs are bounded and hashed before persistence.
- Canonical JSON hashing is deterministic and depth/key/array/string bounded.
- Root arrays, null, non-finite values, oversized bodies, malformed content type, and executable-looking capability fields are rejected according to policy.
- Tests fail before implementation and pass after the smallest implementation.

## Task 2: Add versioned secret protection and signature verification

Write failing crypto tests before production code.

Files to create or update:

- Create `lib/security/secrets.ts` with AES-256-GCM envelope encryption/decryption, key-version validation, trigger/version-bound AAD, random nonce/tag handling, and secret generation.
- Extend `lib/webhooks/protocol.ts` with HMAC-SHA256 signing/verification and fixed-length `crypto.timingSafeEqual` comparison.
- Update `lib/security/errors.ts` or its sanitization boundary only if required to prevent secret-bearing error messages.
- Add `tests/webhook-secrets.test.ts` and `tests/webhook-signature.test.ts`.

Acceptance:

- The encryption key decodes to exactly 32 bytes.
- Tampered ciphertext, tag, key version, trigger ID, or secret version fails closed.
- Secret plaintext is returned only at create/rotate service boundaries and never from persistence projections.
- Signature version, encoding, length, timestamp, and raw-body sensitivity are enforced.
- No secret or signature is logged, audited, or included in generic public errors.

## Task 3: Add webhook schema, migration, projections, and retention cleanup

Write schema/service tests first, then change the schema and generate the migration using repository conventions.

Files to create or update:

- Update `lib/database/schema.ts` with `workflowWebhookTriggers` and `workflowWebhookEvents`, indexes, enums, unique dedupe constraint, foreign keys, and timestamp/status columns.
- Update `lib/database/index.ts` exports if required by the repository's schema access pattern.
- Add `lib/webhooks/repository.ts` for safe trigger/event projections, trigger lookup, event insertion/deduplication, and bounded event listing.
- Add `lib/webhooks/retention.ts` with bounded expiry deletion used by the scheduler maintenance pass.
- Add `tests/webhook-schema.test.ts`, `tests/webhook-repository.test.ts`, and `tests/webhook-retention.test.ts`.
- Run `npm run db:generate`, review the new SQL and snapshot, and run `npm run db:migrate` against the existing PostgreSQL instance.

Acceptance:

- New tables are additive and preserve all existing data.
- Secret ciphertext is not present in safe list/detail/event projections.
- `(triggerId, dedupeKey)` is database-unique.
- Event insertion and duplicate update are safe under concurrent delivery.
- Workspace and trigger/workflow consistency checks are explicit.
- Expired event cleanup is bounded and never deletes active triggers or runs.

## Task 4: Extend automation principal and durable run creation without regressing schedules

Write failing schedule regression and webhook-origin tests before implementation.

Files to update:

- Update `lib/security/principal.ts` with a discriminated schedule/webhook origin while preserving existing constructor compatibility and principal serialization tests.
- Update `lib/workflows/service.ts` by extracting or generalizing the existing scheduled automation run creation path into a shared `createAutomationWorkflowRun`; keep `createScheduledWorkflowRun` as a compatibility wrapper.
- Update `lib/workflows/service.ts` `resolveWorkflowRunPrincipal` to resolve either a schedule occurrence or webhook event and reject missing/cross-workspace origin data.
- Update `lib/workflows/executor.ts` only where principal typing requires it; do not change execution capabilities.
- Add `tests/webhook-automation-run.test.ts` and extend `tests/execution-principal.test.ts`, `tests/workflow-service.test.ts`, `tests/scheduling.integration.test.ts`, and `tests/workflow-runner.test.ts` as needed.

Acceptance:

- Webhook automation runs have `startedBy = NULL` and an origin linked to exactly one trigger/event/workspace.
- Manual user runs remain user-principal runs.
- Scheduled runs behave exactly as before.
- The worker resolves a webhook origin before executing and fails safely if origin data is missing or inconsistent.
- Agent, AI, RAG, and workflow registry code receives the same controlled principal/tool boundaries as schedule runs.

## Task 5: Implement centralized authorization, audit, and management services

Write failing authorization/service tests first.

Files to update or create:

- Update `lib/authz/authorization.ts` with `workflow_webhook.read/create/update/enable/disable/delete/rotate_secret` and OWNER/ADMIN/MEMBER policy.
- Update `lib/audit/service.ts` with webhook actions/resource types and safe metadata rules.
- Create `lib/webhooks/service.ts` for authenticated trigger CRUD, enable/disable, one-time secret create/rotate, safe detail/list/history, workflow validation, and sanitized audit calls.
- Add request schemas in `lib/webhooks/validation.ts` for create/update/history pagination.
- Add `tests/webhook-authorization.test.ts`, `tests/webhook-service.test.ts`, and `tests/webhook-audit.test.ts`.

Acceptance:

- OWNER/ADMIN can manage; MEMBER reads only.
- All management operations check membership and resource workspace together.
- Secrets are returned once only and never from GET/list/history.
- Update cannot alter secret fields or workspace ownership.
- Audit records contain IDs/status/safe metadata only.

## Task 6: Add authenticated management API routes

Write route tests first, keeping handlers thin.

Files to create:

- `app/api/workflow-webhooks/route.ts` for authenticated list/create.
- `app/api/workflow-webhooks/[id]/route.ts` for authenticated detail/update/delete.
- `app/api/workflow-webhooks/[id]/enable/route.ts`.
- `app/api/workflow-webhooks/[id]/disable/route.ts`.
- `app/api/workflow-webhooks/[id]/rotate-secret/route.ts`.
- `app/api/workflow-webhooks/[id]/events/route.ts`.
- Add `tests/webhook-routes.test.ts` and `tests/webhook-history-route.test.ts`.

Acceptance:

- Every body is validated with Zod.
- Routes use Better Auth session, centralized workspace action checks, typed service results, and `errorResponse`.
- Error/status behavior matches existing API conventions.
- Responses omit secret ciphertext/plaintext except the explicit create/rotate response.
- Pagination is bounded and cannot query another workspace.

## Task 7: Implement public ingress with raw-body bounds, Redis admission, and durable transaction

Write failing public-route/service tests before production code.

Files to create or update:

- Create `lib/webhooks/rate-limit.ts` using the existing Redis connection and atomic global/per-trigger windows; fail closed when Redis is unavailable.
- Create `lib/webhooks/ingress.ts` for trigger lookup, lock/verification, bounded parsing, dedupe, event/run transaction, and typed public outcomes.
- Create `app/api/hooks/[publicId]/route.ts` for bounded raw-body reading, header extraction, service call, and generic response mapping.
- Add `tests/webhook-rate-limit.test.ts`, `tests/webhook-ingress.test.ts`, and `tests/webhook-public-route.test.ts`.

Acceptance:

- The route verifies the exact raw bytes and never accepts workspace/user/workflow/principal/tool input from the sender.
- Unknown, disabled, stale, malformed, and invalid-signature requests do not create records and use generic responses.
- Valid authenticated deliveries commit event + existing workflow run + existing outbox before `202`.
- Duplicate deliveries return `202` without another run.
- Disabled/deleted workflows create safe `SKIPPED` history without a run.
- Database failure returns generic `503`; Redis outage fails closed with generic `503`.
- No direct BullMQ, Ollama, AgentRunner, shell, SQL, filesystem, or unrestricted network call occurs in public ingress.

## Task 8: Integrate scheduler cleanup and preserve runtime boundaries

Write a scheduler regression test before wiring cleanup.

Files to update:

- Update `lib/schedules/scheduler.ts` or the existing scheduler runtime seam with a bounded maintenance invocation that does not block due-schedule processing.
- Update `worker/workflow-scheduler.ts` only if its runtime composition requires the new cleanup function.
- Add `tests/webhook-scheduler-cleanup.test.ts` and extend `tests/scheduler-runtime.test.ts`.

Acceptance:

- Existing due-schedule processing, occurrence idempotency, and scheduler health remain unchanged.
- Cleanup deletes only expired event metadata in bounded batches.
- A cleanup failure is observable but does not create or delete workflow runs.
- No new process or queue is introduced.

## Task 9: Add focused webhook management UI

Write component tests before UI implementation.

Files to create or update:

- Create a focused component under `components/workflow-webhooks/` for trigger list, create/edit state, one-time secret reveal/rotation, enable/disable, and safe history.
- Update the existing dashboard page/navigation to expose the component without changing existing workspace behavior.
- Add `tests/webhook-panel.test.tsx` or the repository-equivalent component test.

Acceptance:

- The UI never renders a secret from list/detail/history responses.
- A newly returned secret is visibly one-time and can be copied without persisting it in the URL.
- MEMBER sees read-only state.
- History shows safe metadata only and handles generic API errors.

## Task 10: Documentation, verification, and review

Files to update:

- `README.md`, `SETUP.md`, `SECURITY.md`, `ARCHITECTURE.md`, `AI.md` only where M8 boundaries/configuration affect those documents.
- `.env.example` with all webhook variables.
- `docker-compose.yml` only to pass required configuration to app/scheduler services; preserve ports, volumes, PostgreSQL, Redis, Ollama, worker, and scheduler architecture.
- Add or update verification scripts only if needed for the public health/runtime checks.

Verification commands:

```powershell
docker compose config
npm run typecheck
npm run lint
npm test -- --run
npm run build
docker compose up -d --build
docker compose ps -a
.\scripts\verify-local.ps1
```

Also run a focused acceptance script/test that creates a trigger, signs a bounded request, posts it twice, verifies one run/outbox/event and one duplicate count, checks event history does not expose the secret/payload/headers, and confirms the existing worker path completes. Do not remove volumes or reset the database.

Before the final local commit:

- Inspect `git diff --check` and `git status`.
- Review all new public routes for generic responses, raw-body ordering, authorization, and workspace checks.
- Review migration SQL and schema snapshot.
- Run the full existing regression suite and runtime verification from fresh command output.
- Request a code review if the subagent/review capability is available; otherwise perform an explicit self-review against the approved spec and list any residual issues.

