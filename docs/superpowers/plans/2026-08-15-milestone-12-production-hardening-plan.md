# Milestone 12 Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production hardening, workspace usage limits, durable quota admission, bounded concurrency, observability, readiness, cleanup, and production configuration validation without regressing M1–M11.

**Architecture:** Reuse the existing Better Auth, workspace authorization, PostgreSQL/Drizzle, Redis/BullMQ, scheduler, outbox, workflow, agent, AI, webhook, approval, integration, audit, and error abstractions. Add small focused services for usage policy, durable admission, reservations, correlation/logging, readiness, and bounded operations projections.

**Tech Stack:** Next.js 15, TypeScript, PostgreSQL/Drizzle, Redis/ioredis, BullMQ, Zod, Vitest, Docker Compose, existing Tailwind/shadcn UI.

**Spec:** `docs/superpowers/specs/2026-08-15-milestone-12-production-hardening-design.md`

## Global Constraints

- Implement Milestone 12 only; do not start Milestone 13.
- Do not add billing, plans persistence, Stripe, new connectors, generic HTTP, OAuth, browser automation, file uploads, plugins, marketplace features, or multi-agent orchestration.
- Do not upgrade or install dependencies.
- Keep `SELF_HOSTED` plan resolution static and server-side.
- Keep PostgreSQL authoritative for durable quotas, usage admissions, workflow state, and concurrency reservations.
- Keep Redis limited to bounded short-window rate limiting and existing queue/heartbeat infrastructure.
- Preserve M11 `AMBIGUOUS` terminal semantics; never automatically retry an ambiguous external outcome.
- Never store or return secrets, credentials, prompts, responses, webhook bodies, or raw provider payloads in M12 artifacts.
- Preserve local development defaults, Docker services, ports, named volumes, and existing data.
- Generate migrations with `npm run db:generate`; never hand-write migration SQL or metadata.
- Do not commit or push implementation work until explicitly authorized by the user.

## Expected implementation file map

The implementation should be organized around focused services:

- Create `lib/usage/types.ts`, `lib/usage/policy.ts`, `lib/usage/resolver.ts`, `lib/usage/admission.ts`, `lib/usage/repository.ts`, `lib/usage/operations.ts`, and `lib/usage/retention.ts`.
- Create `lib/concurrency/types.ts`, `lib/concurrency/repository.ts`, and `lib/concurrency/service.ts`.
- Create `lib/observability/correlation.ts`, `lib/observability/redaction.ts`, and `lib/observability/logger.ts`.
- Modify `lib/env.ts`, `lib/database/schema.ts`, `lib/authz/authorization.ts`, `lib/security/errors.ts`, `lib/audit/service.ts`, `lib/health/checks.ts`, and `lib/health/types.ts`.
- Modify `lib/workflows/outbox.ts`, `lib/workflows/queue.ts`, `lib/workflows/worker.ts`, `lib/workflows/executor.ts`, and the relevant workflow service functions.
- Modify `lib/ai/service.ts`, `lib/ai/generation-log.ts`, `lib/agents/service.ts`, `lib/agents/runner.ts`, `lib/integrations/actions.ts`, `lib/workflows/executors/integration-action.ts`, `lib/webhooks/ingress.ts`, `lib/knowledge/service.ts`, and scheduling services.
- Add `app/api/health/ready/route.ts`, `app/api/workspaces/[id]/usage/route.ts`, and `app/api/workspaces/[id]/operations/route.ts`.
- Add focused dashboard operations UI components and include them in `app/(dashboard)/dashboard/page.tsx`.
- Modify `worker/workflow-scheduler.ts` and `scripts/verify-local.ps1`.
- Add generated Drizzle migration and metadata only after schema tests pass.

The exact generated migration filename is determined by Drizzle and must be reviewed after `npm run db:generate`; it must be the next migration after the current M1–M11 migration set.

## Task 1: Establish policy and operation contracts

**Files:**

- Create: `lib/usage/types.ts`
- Create: `lib/usage/policy.ts`
- Create: `lib/usage/resolver.ts`
- Test: `tests/usage-policy.test.ts`
- Test: `tests/usage-operation-keys.test.ts`

**Tests written first:**

- `SELF_HOSTED` is returned for any workspace without database access.
- All approved limits are present exactly once in the policy.
- Invalid environment overrides fail centrally and cannot create negative, zero, or excessive limits.
- Workflow retry keys, webhook event keys, AI step keys, agent decision keys, and integration action keys are stable and bounded.
- No operation key contains prompts, responses, credentials, or webhook payloads.

**Implementation changes:**

- Define metric and operation-class types.
- Implement static `WorkspacePlanResolver`.
- Implement centralized `WorkspaceUsagePolicy` with the approved limits.
- Implement operation-key constructors for direct and workflow-triggered operations.
- Define typed admission results and usage projection types.

**Migration implications:** None.

**Verification:**

```powershell
npm test -- --run tests/usage-policy.test.ts tests/usage-operation-keys.test.ts
```

**Expected result:** Policy and operation-key tests pass; no production files outside the usage policy layer are changed.

**Security/regression considerations:** Keep plan resolution independent of user input. Do not add a plan column or expose policy internals to members without authorization.

## Task 2: Add correlation context, redaction, and structured logging

**Files:**

- Create: `lib/observability/correlation.ts`
- Create: `lib/observability/redaction.ts`
- Create: `lib/observability/logger.ts`
- Modify: `lib/security/errors.ts`
- Modify: `lib/audit/service.ts`
- Test: `tests/observability-redaction.test.ts`
- Test: `tests/correlation-propagation.test.ts`

**Tests written first:**

- Invalid or oversized request IDs are replaced by generated IDs.
- Valid request IDs propagate to a workflow root, outbox record, BullMQ job data, executor context, and audit metadata.
- Redaction removes secret, token, credential, authorization, cookie, prompt, response, body, and provider-payload fields.
- Redaction enforces depth, array, string, and serialized-size bounds.
- An unhandled error logs only safe error identity fields and never the raw exception object.

**Implementation changes:**

- Add explicit correlation context helpers and safe request-header parsing.
- Add dependency-free structured logging and redaction.
- Add a safe correlation field to audit metadata.
- Route unhandled error diagnostics through the redacted logger.

**Migration implications:** Correlation columns are introduced in the schema task; this task remains compatible with nullable values.

**Verification:**

```powershell
npm test -- --run tests/observability-redaction.test.ts tests/correlation-propagation.test.ts
npm run typecheck
```

**Expected result:** Redaction and correlation tests pass without changing user-visible error messages except for new typed M12 categories.

**Security/regression considerations:** Never place prompts, model output, credential IDs with secret material, or webhook content in correlation context.

## Task 3: Add schema definitions and schema-focused tests

**Files:**

- Modify: `lib/database/schema.ts`
- Test: `tests/usage-schema.test.ts`
- Test: `tests/concurrency-schema.test.ts`
- Test: `tests/workflow-dispatch-schema.test.ts`

**Tests written first:**

- Usage buckets enforce workspace/metric/bucket uniqueness.
- Usage admissions enforce workspace/metric/operation-key uniqueness.
- Concurrency state is unique by workspace and operation class.
- Reservations contain owner, source, expiry, and bounded state fields.
- Dispatch deferral fields are nullable/defaulted compatibly with existing rows.
- `workflow_run_dispatches` retains `PENDING`, `CLAIMED`, `DISPATCHED`, and `FAILED`.
- Correlation fields are nullable and do not alter existing M1–M11 status checks.

**Implementation changes:**

- Add usage bucket/admission tables.
- Add concurrency state/reservation tables.
- Add `nextAttemptAt`, `deferCount`, and bounded `deferReason` to dispatches.
- Add nullable correlation IDs to operational roots and dispatch records where propagation requires persistence.
- Add only the unique and query-backed indexes specified in the design.

**Migration implications:** This is the source schema for the next generated migration. Do not hand-edit SQL or migration metadata.

**Verification:**

```powershell
npm test -- --run tests/usage-schema.test.ts tests/concurrency-schema.test.ts tests/workflow-dispatch-schema.test.ts
npm run typecheck
```

**Expected result:** Schema types and constraints compile and focused schema tests pass before migration generation.

**Security/regression considerations:** Preserve all existing foreign keys, status checks, unique indexes, and encrypted credential columns. Do not alter or drop M1–M11 tables.

## Task 4: Implement atomic PostgreSQL quota admission

**Files:**

- Create: `lib/usage/repository.ts`
- Create: `lib/usage/admission.ts`
- Modify: `lib/workflows/service.ts`
- Modify: `lib/agents/service.ts`
- Modify: `lib/knowledge/service.ts`
- Modify: `lib/integrations/credentials.ts`
- Test: `tests/quota-admission.test.ts`
- Test: `tests/quota-race.integration.test.ts`
- Test: `tests/quota-operation-retry.test.ts`

**Tests written first:**

- Two concurrent transactions cannot admit beyond a daily workspace limit.
- A duplicate operation key returns an idempotent result without incrementing the bucket.
- A quota rejection rolls back the admission row and root operation.
- Workflow BullMQ retry, workflow step retry, agent retry, and stale recovery reuse the original admission.
- Knowledge document and credential counts enforce the approved current-state limits.
- Direct workflow idempotency returns the existing run without a second usage unit.

**Implementation changes:**

- Implement transaction-scoped `admitWorkspaceUsage` with unique admission insertion and conditional bucket increment.
- Add admission calls at root creation, not at worker attempt boundaries.
- Keep workflow creation, dispatch-row creation, and workflow-start admission in one transaction.
- Count AI logical generation requests through a stable key while keeping raw prompt/response data out of usage tables.
- Count unique accepted webhook events only after M8 deduplication in the webhook task.

**Migration implications:** Requires the generated schema migration from Task 3 before integration verification.

**Verification:**

```powershell
npm test -- --run tests/quota-admission.test.ts tests/quota-race.integration.test.ts tests/quota-operation-retry.test.ts
```

**Expected result:** Atomic race tests pass and repeated infrastructure paths do not double-count.

**Security/regression considerations:** PostgreSQL is authoritative. Never use Redis counters as a substitute for the transaction. Ensure workspace ID is taken from the authorized resource/principal, never an unverified client field.

## Task 5: Add Redis short-window workspace rate limiting

**Files:**

- Create: `lib/usage/rate-limit.ts`
- Modify: `lib/webhooks/rate-limit.ts` only if a shared safe primitive can be reused without changing M8 behavior
- Modify: `lib/security/errors.ts`
- Test: `tests/workspace-rate-limit.test.ts`
- Test: `tests/rate-limit-outage.test.ts`

**Tests written first:**

- Workspace and operation buckets use atomic increment/expiry behavior.
- Limits reject the request before provider, queue, or integration work begins.
- Redis errors fail closed for expensive and externally affecting operations.
- Redis restart does not affect PostgreSQL daily usage counters.
- M8 global/per-trigger webhook limits and fail-closed error codes remain unchanged.

**Implementation changes:**

- Add a small internal limiter with the existing ioredis style and bounded key/TTL construction.
- Add typed `RATE_LIMIT` errors.
- Place limiter admission before durable quota admission for direct expensive operations.
- Reuse the existing webhook limiter rather than replacing its public error contract.

**Migration implications:** None.

**Verification:**

```powershell
npm test -- --run tests/workspace-rate-limit.test.ts tests/rate-limit-outage.test.ts tests/webhook-rate-limit.test.ts
```

**Expected result:** Fast limits are atomic and outage behavior is fail-closed without changing M8 replay/dedupe semantics.

**Security/regression considerations:** Do not include secrets or raw request content in Redis keys. Redis is not durable quota authority.

## Task 6: Implement PostgreSQL concurrency reservations

**Files:**

- Create: `lib/concurrency/types.ts`
- Create: `lib/concurrency/repository.ts`
- Create: `lib/concurrency/service.ts`
- Test: `tests/concurrency-reservation.test.ts`
- Test: `tests/concurrency-race.integration.test.ts`
- Test: `tests/concurrency-expiration-recovery.test.ts`

**Tests written first:**

- Concurrent acquisition never exceeds the workspace/class limit.
- Renewal succeeds only for the current owner before expiry.
- Release is idempotent.
- Expired reservations no longer consume capacity.
- A simulated worker crash is recovered after expiry.
- A reservation from workspace A cannot affect workspace B.
- Terminal workflow, agent, and integration paths release reservations.

**Implementation changes:**

- Lock the workspace/class state row during acquire.
- Reap expired reservations before comparing active count.
- Create unique reservation IDs with owner/source/expiry.
- Add conditional renewal and idempotent release.
- Return typed concurrency errors without modifying workflow status.

**Migration implications:** Requires the Task 3 schema migration.

**Verification:**

```powershell
npm test -- --run tests/concurrency-reservation.test.ts tests/concurrency-race.integration.test.ts tests/concurrency-expiration-recovery.test.ts
```

**Expected result:** Reservation lifecycle and race tests pass with PostgreSQL as the authority.

**Security/regression considerations:** Never release another workspace’s reservation. Keep existing workflow execution-token checks authoritative for stale-worker safety.

## Task 7: Integrate workflow outbox deferral and queue handoff

**Files:**

- Modify: `lib/workflows/outbox.ts`
- Modify: `lib/workflows/queue.ts`
- Modify: `lib/workflows/worker.ts`
- Modify: `lib/workflows/executor.ts`
- Modify: `lib/workflows/service.ts`
- Test: `tests/workflow-outbox-deferral.test.ts`
- Test: `tests/workflow-outbox-race.integration.test.ts`
- Test: `tests/workflow-dispatch-recovery.test.ts`

**Tests written first:**

- `CLAIMED` with no workspace slot returns to `PENDING` with bounded `nextAttemptAt` and increments only `deferCount`.
- Concurrency deferral leaves the workflow `QUEUED` and does not increment dispatch failure attempts.
- Successful reservation and enqueue move the row to existing `DISPATCHED`.
- Actual enqueue failures move to `FAILED` using existing bounded retry policy.
- Stale `CLAIMED` rows return to `PENDING` without duplicating work.
- Deterministic BullMQ IDs make a crash between enqueue and `DISPATCHED` marking safe.
- Handoff reservation expiry returns a still-queued workflow to a new dispatch generation without failing it.
- Fairness prevents one workspace from filling a dispatch poll.

**Implementation changes:**

- Extend `WorkflowJobData` with safe reservation/generation/correlation identifiers.
- Separate dispatch failure attempts from concurrency defer count.
- Add bounded readiness ordering and per-workspace dispatch share.
- Acquire a workflow reservation before enqueue and release/recover it according to the handoff protocol.
- Make worker adoption and re-dispatch guarded by PostgreSQL state.
- Preserve `executeWorkflowRun`, execution tokens, step retries, cancellation, approval pauses, and stale recovery.

**Migration implications:** Requires dispatch deferral columns from Task 3.

**Verification:**

```powershell
npm test -- --run tests/workflow-outbox-deferral.test.ts tests/workflow-outbox-race.integration.test.ts tests/workflow-dispatch-recovery.test.ts
```

**Expected result:** Workflow pressure causes bounded deferral, not workflow failure or retry storms.

**Security/regression considerations:** Job payloads contain identifiers only. Do not enqueue credentials, prompts, workflow output, or webhook bodies. Preserve the existing at-least-once model.

## Task 8: Integrate AI, agent, and workflow usage admission

**Files:**

- Modify: `lib/ai/service.ts`
- Modify: `lib/ai/generation-log.ts`
- Modify: `lib/agents/service.ts`
- Modify: `lib/agents/runner.ts`
- Modify: `lib/workflows/executors/ai-generate.ts`
- Modify: `lib/workflows/executors/agent.ts`
- Modify: `app/api/ai/generate/route.ts`
- Modify: `app/api/agents/[id]/runs/route.ts`
- Test: `tests/ai-usage-admission.test.ts`
- Test: `tests/agent-usage-admission.test.ts`
- Test: `tests/workflow-ai-retry-accounting.test.ts`
- Test: `tests/agent-retry-accounting.test.ts`

**Tests written first:**

- Direct AI admission occurs before `LLMProvider.generate` or `.stream`.
- Direct AI supports validated idempotency keys and does not store prompts/responses in usage records.
- Agent start consumes one agent-run unit and enforces concurrent-agent capacity.
- A workflow AI step retry reuses `workflowRunId:stepId` and does not double-count.
- An agent decision retry reuses `agentRunId:stepNumber` and does not double-count.
- Provider failure after admission records bounded generation metadata and does not retry through a new admission.
- AI output characters and duration are bounded observability fields only.

**Implementation changes:**

- Add admission and reservation checks at service boundaries, not in the provider.
- Keep `LLMProvider` unchanged as the provider abstraction.
- Add request correlation and optional `Idempotency-Key` handling at direct routes.
- Preserve RAG/BrandContext workspace isolation and existing prompt bounds.
- Keep `AgentRunner` and static safe tool registry unchanged except for admission hooks.

**Migration implications:** Requires nullable correlation fields and usage tables.

**Verification:**

```powershell
npm test -- --run tests/ai-usage-admission.test.ts tests/agent-usage-admission.test.ts tests/workflow-ai-retry-accounting.test.ts tests/agent-retry-accounting.test.ts
```

**Expected result:** AI and agent usage is counted at logical admission boundaries with no raw content leakage.

**Security/regression considerations:** Do not place usage checks inside LLM provider code or expose prompts/responses in errors, logs, queues, audit data, or usage projections.

## Task 9: Integrate webhook, knowledge, schedules, and credential limits

**Files:**

- Modify: `lib/webhooks/ingress.ts`
- Modify: `lib/webhooks/repository.ts`
- Modify: `lib/knowledge/service.ts`
- Modify: `lib/schedules/service.ts`
- Modify: `lib/integrations/credentials.ts`
- Modify: `lib/integrations/actions.ts`
- Modify: `lib/workflows/executors/integration-action.ts`
- Test: `tests/webhook-usage-accounting.test.ts`
- Test: `tests/webhook-duplicate-quota.test.ts`
- Test: `tests/knowledge-usage-limits.test.ts`
- Test: `tests/schedule-credential-limits.test.ts`
- Test: `tests/integration-usage-accounting.test.ts`
- Test: `tests/integration-ambiguous-retry.test.ts`

**Tests written first:**

- A unique accepted webhook event creates one durable admission.
- A replay/deduplication duplicate updates existing metadata but consumes no durable accepted-event quota.
- Invalid signature, replay, payload, and rate-limited webhook requests consume no durable quota.
- Knowledge document/character limits are workspace-scoped and atomic.
- Active schedules and credentials enforce current-state limits without deleting existing data.
- Integration actions reuse the existing logical action identity.
- Retryable Slack failures retain existing retry behavior.
- `AMBIGUOUS` actions remain terminal and are never automatically retried.

**Implementation changes:**

- Insert webhook admission in the existing transaction after unique event insertion and before workflow-run creation.
- Add knowledge/schedule/credential admission checks to their existing services.
- Add integration concurrency and action usage at `claimIntegrationAction`/action-root boundaries.
- Preserve M8 encryption and M11 operation-policy approval enforcement.

**Migration implications:** Requires usage and concurrency tables; no credential plaintext changes.

**Verification:**

```powershell
npm test -- --run tests/webhook-usage-accounting.test.ts tests/webhook-duplicate-quota.test.ts tests/knowledge-usage-limits.test.ts tests/schedule-credential-limits.test.ts tests/integration-usage-accounting.test.ts tests/integration-ambiguous-retry.test.ts
```

**Expected result:** Webhook duplicate accounting, current-state limits, Slack action accounting, and ambiguity invariants pass.

**Security/regression considerations:** Never count raw rejected webhook traffic durably. Never retry or reinterpret `AMBIGUOUS` external outcomes.

## Task 10: Add typed failure categories and safe error responses

**Files:**

- Modify: `lib/security/errors.ts`
- Modify: `lib/http.ts` only if needed for stable category mapping
- Modify: relevant admission, concurrency, workflow, AI, and integration services
- Test: `tests/error-category.test.ts`
- Test: `tests/error-response-redaction.test.ts`

**Tests written first:**

- Quota, rate, concurrency, provider, infrastructure, timeout, and ambiguous errors map to stable safe response codes.
- Workspace authorization failures retain existing non-leaking behavior.
- Unknown exceptions never expose stack traces or raw messages.
- `AMBIGUOUS_EXTERNAL_SIDE_EFFECT` cannot be marked retryable by generic classification.

**Implementation changes:**

- Add typed AppError codes and category mapping.
- Make generic error logging use the structured redacted logger.
- Ensure workflow error classification preserves non-retryable ambiguity.

**Migration implications:** None.

**Verification:**

```powershell
npm test -- --run tests/error-category.test.ts tests/error-response-redaction.test.ts
```

**Expected result:** Browser responses remain bounded and safe while worker retry decisions remain explicit.

**Security/regression considerations:** Do not change existing M8/M11 public error contracts unless the new mapping preserves their stable codes and statuses.

## Task 11: Add readiness and production-only configuration validation

**Files:**

- Modify: `lib/env.ts`
- Modify: `lib/health/checks.ts`
- Modify: `lib/health/types.ts`
- Create: `lib/health/readiness.ts`
- Create: `app/api/health/ready/route.ts`
- Test: `tests/production-env-validation.test.ts`
- Test: `tests/readiness.test.ts`

**Tests written first:**

- Development and test defaults continue to parse unchanged.
- Production rejects placeholder Better Auth, webhook, and integration key material.
- Production rejects localhost public URLs and invalid M12 overrides.
- PostgreSQL/Redis failure is `not_ready`.
- Ollama/model failure is `degraded` when PostgreSQL/Redis/configuration are ready.
- Existing `/api/health` response remains liveness-compatible.

**Implementation changes:**

- Add production-only `superRefine` checks without changing development Compose defaults.
- Compose readiness checks for configuration, PostgreSQL, Redis, migrations, and optional Ollama.
- Add safe readiness route with no connection strings or host details.

**Migration implications:** Readiness checks migration state after the M12 migration is applied; no schema change in this task.

**Verification:**

```powershell
npm test -- --run tests/production-env-validation.test.ts tests/readiness.test.ts
```

**Expected result:** Local development remains unchanged; production misconfiguration fails early; readiness distinguishes core and optional AI state.

**Security/regression considerations:** Never return secret validation details or internal connection information to unauthenticated health callers.

## Task 12: Add workspace operations and usage projections

**Files:**

- Modify: `lib/authz/authorization.ts`
- Create: `lib/usage/operations.ts`
- Create: `app/api/workspaces/[id]/usage/route.ts`
- Create: `app/api/workspaces/[id]/operations/route.ts`
- Create: `lib/operations/validation.ts` if route query validation is kept separate
- Test: `tests/operations-authorization.test.ts`
- Test: `tests/operations-isolation.test.ts`
- Test: `tests/operations-bounded-query.test.ts`
- Test: `tests/operations-routes.test.ts`

**Tests written first:**

- OWNER and ADMIN can read their workspace usage and operations.
- MEMBER is denied with existing non-leaking authorization behavior.
- Workspace A cannot read workspace B’s data, even when IDs are mixed in query parameters.
- Limits, remaining values, reset times, and counts are bounded and safe.
- Queries enforce maximum time range and row count.
- Redis degradation is represented safely without leaking infrastructure details.

**Implementation changes:**

- Add `workspace.operations.read` to the central authorization action map.
- Implement bounded PostgreSQL projections and limited Redis live reads.
- Add thin authenticated route handlers using `requireUser`, Zod validation, authorization, and `errorResponse`.

**Migration implications:** Uses indexes from Task 3; no additional migration unless query review proves one necessary.

**Verification:**

```powershell
npm test -- --run tests/operations-authorization.test.ts tests/operations-isolation.test.ts tests/operations-bounded-query.test.ts tests/operations-routes.test.ts
```

**Expected result:** Only authorized workspace-scoped safe summaries are returned.

**Security/regression considerations:** Do not add a global admin bypass. Do not return raw audit, queue, webhook, integration, or provider payloads.

## Task 13: Add bounded retention and maintenance cleanup

**Files:**

- Create: `lib/usage/retention.ts`
- Modify: `lib/ai/generation-log.ts`
- Modify: `lib/schedules/service.ts` or the existing occurrence repository used for cleanup
- Modify: `lib/webhooks/repository.ts` only to preserve/reuse existing bounded cleanup conventions
- Modify: `worker/workflow-scheduler.ts`
- Test: `tests/m12-retention.test.ts`
- Test: `tests/m12-retention-recovery.test.ts`

**Tests written first:**

- Generation logs older than 30 days are deleted in bounded batches.
- Scheduler occurrences older than 30 days are deleted in bounded batches.
- Existing webhook event retention remains 30 days and bounded.
- Protected audit, approval, credential lifecycle, ambiguous action, workflow, agent, knowledge, and definition rows are not deleted.
- Cleanup is idempotent and safe when interrupted.
- Active/unresolved usage admission keys are retained.

**Implementation changes:**

- Add bounded cleanup functions using indexed timestamps/expiry.
- Register them in the existing scheduler maintenance callback alongside webhook and approval cleanup.
- Log only safe cleanup counts and durations.

**Migration implications:** Uses retention indexes from Task 3.

**Verification:**

```powershell
npm test -- --run tests/m12-retention.test.ts tests/m12-retention-recovery.test.ts
```

**Expected result:** Cleanup removes only approved short-lived operational data and remains safe under repeated execution.

**Security/regression considerations:** Do not broaden cleanup to user-owned or security history. Keep maintenance non-blocking for schedule processing.

## Task 14: Add dashboard operations/usage UI

**Files:**

- Create: `components/forms/operations-panel.tsx`
- Create: `components/forms/usage-summary.tsx`
- Modify: `app/(dashboard)/dashboard/page.tsx`
- Test: `tests/operations-ui-contract.test.tsx`

**Tests written first:**

- The panel renders bounded usage and operational fields only.
- Member or unauthorized responses do not render privileged data.
- Loading, degraded Ollama, quota, and infrastructure states are user-safe.
- No secret, credential, prompt, response, webhook body, or raw provider field is rendered.

**Implementation changes:**

- Add a presentation-focused panel using existing dashboard styling/components.
- Fetch the workspace-scoped APIs through existing authenticated browser patterns.
- Show operational limits as limits, not pricing or billing promises.

**Migration implications:** None.

**Verification:**

```powershell
npm test -- --run tests/operations-ui-contract.test.tsx
npm run typecheck
```

**Expected result:** OWNER/ADMIN users see safe workspace operations information without changing existing M1–M11 panels.

**Security/regression considerations:** Treat API responses as untrusted and keep the component presentation-only; never add client-side authorization as a substitute for server checks.

## Task 15: Generate and review the Drizzle migration

**Files:**

- Modify: `lib/database/schema.ts` only if schema review found a missing generated definition
- Create: next Drizzle-generated migration under `db/migrations/`
- Create/modify: matching Drizzle-generated metadata under `db/migrations/meta/`
- Modify: `scripts/verify-local.ps1`
- Test: `tests/migration-schema-contract.test.ts`

**Tests written first:**

- The schema contract expects usage, admission, reservation, correlation, and dispatch deferral structures.
- Existing M1–M11 tables, constraints, and indexes remain present.
- The migration applies cleanly to a clean database.
- The migration applies incrementally to the existing database without dropping data.

**Implementation changes:**

- Run `npm run db:generate` after schema tests pass.
- Review generated SQL for additive tables/columns/indexes, no destructive reset, no secret data migration, and no hand-edited metadata.
- Extend `Assert-DatabaseSchema` with M12 table, constraint, index, and dispatch-field checks.

**Migration implications:** This is the only task that creates the M12 migration. Apply it to both the existing PostgreSQL database and a clean temporary database before relying on the schema.

**Verification:**

```powershell
npm run db:generate
git diff -- db/migrations lib/database/schema.ts scripts/verify-local.ps1
docker compose exec -T app npm run db:migrate
```

**Expected result:** Generated migration is additive, reviewed, and succeeds against the existing database.

**Security/regression considerations:** Stop immediately if generated SQL drops or rewrites existing M1–M11 data structures. Do not use `db:push` as a migration substitute.

## Task 16: Verify existing and clean PostgreSQL databases

**Files:**

- Modify: `scripts/verify-local.ps1`
- Test: `tests/m12-database-verification.test.ts`

**Tests written first:**

- The current database contains all M1–M12 tables, checks, unique keys, and indexes.
- A clean temporary database receives every migration in order and contains the same required structures.
- The current database retains existing row counts for protected M1–M11 tables before and after migration.
- The temporary database is removed in a `finally` block even when a check fails.

**Implementation changes:**

- Extend existing `Assert-DatabaseSchema` rather than replacing it.
- Add M12 checks for usage buckets/admissions, concurrency structures, correlation fields, and dispatch deferral fields.
- Preserve all existing embedding, workflow, webhook, approval, editor, integration, and index checks.

**Migration implications:** Requires the generated M12 migration from Task 15.

**Verification:**

```powershell
docker compose exec -T app npm run db:migrate
.\scripts\verify-local.ps1
```

**Expected result:** Both the existing and clean temporary databases pass their schema contracts and no protected data is reset.

**Security/regression considerations:** Never run `dropdb` against the existing `flowyn` database. Only the named temporary verification database may be recreated.

## Task 17: Complete full runtime verification and final security review

**Files:**

- Modify: documentation/configuration files only if verification reveals a documented M12 setup requirement
- Test: all existing tests plus all new M12 tests

**Tests written first:** No new feature tests are deferred to this task; this task runs the complete suite and verifies the acceptance matrix.

**Implementation changes:** None beyond fixes required by failed acceptance tests; no unrelated refactoring.

**Migration implications:** The generated migration must already be applied to the existing and clean temporary databases.

**Verification commands:**

```powershell
npm run typecheck
npm run lint
npm test -- --run
npm run build
docker compose config
docker compose up -d --build
docker compose ps
.\scripts\verify-local.ps1
```

Also run focused tests for:

```powershell
npm test -- --run tests/quota-race.integration.test.ts tests/concurrency-race.integration.test.ts tests/workflow-outbox-race.integration.test.ts tests/rate-limit-outage.test.ts tests/operations-isolation.test.ts tests/integration-ambiguous-retry.test.ts
```

**Expected result:** All static checks, unit tests, integration tests, Docker checks, existing-database checks, clean-database checks, and local verification pass.

**Security/regression considerations:** Confirm no secrets, prompts, responses, webhook bodies, credential material, raw provider payloads, new generic HTTP capability, or M13 work entered the change set. Confirm `AMBIGUOUS` actions remain terminal and no automatic retry path was added.

## Plan handoff

This plan does not authorize implementation, dependency changes, migrations, commits, or pushes. Implementation begins only after explicit authorization and must use the approved design specification as its source of truth.
