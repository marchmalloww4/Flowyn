
# Milestone 7 — Scheduling and Automation Triggers Design

## Status

Approved architecture. This document defines Milestone 7 only. Milestones 1–6 remain intact. Milestone 8 is excluded.

## Objective

Make existing enabled Flowyn workflows runnable automatically from durable time-based schedules while preserving the Milestone 6 workflow run, outbox, BullMQ, worker, lease, retry, cancellation, snapshot, and workspace-isolation semantics.

Supported types are CRON, INTERVAL, and ONE_TIME. The scheduler creates durable workflow runs and outbox records. It never executes workflow steps, calls Ollama, invokes AgentRunner, or waits for BullMQ.

~~~text
workflow_schedules
  -> PostgreSQL due-schedule transaction
  -> workflow_schedule_occurrences
  -> existing workflow run/version/snapshot service
  -> existing workflow_run_dispatches outbox
  -> existing BullMQ queue
  -> existing workflow worker/executor
~~~

## Scope boundaries

Milestone 7 includes schedule persistence, schedule calculation, durable occurrences, bounded misfire handling, a dedicated scheduler process, schedule APIs, a focused schedule-management UI, audit events, and real scheduler/worker integration verification.

It does not include incoming webhooks, arbitrary HTTP integrations, OAuth, Gmail, Slack, Shopify, LinkedIn, social publishing, browser automation, shell execution, arbitrary SQL, arbitrary filesystem access, visual workflow canvas editing, marketplace features, billing, multi-agent orchestration, or Milestone 8 features.

## Existing architecture reused

The implementation remains within Flowyn's modular monolith and reuses:

- Better Auth session lookup through requireUser.
- Central workspace actions and membership checks in lib/authz/authorization.ts.
- AppError, Zod validation, readJson, and errorResponse.
- Drizzle/PostgreSQL and generated migrations.
- Sanitized audit persistence through recordAuditEvent.
- LLMProvider, prepareGeneration, and generateText for workflow AI steps.
- Brand-scoped BrandContext and filtered knowledge retrieval.
- The controlled AgentRunner and static tool registry.
- Immutable workflow versions and run snapshots.
- The workflow run service and transactional workflow_run_dispatches outbox.
- BullMQ/Redis queue delivery and the existing workflow worker/executor.
- Existing workflow output, retry, lease, cancellation, and safe-history boundaries.
- Docker Compose's existing application image, PostgreSQL, Redis, Ollama, app, and worker services.

No second authentication system, authorization layer, agent engine, workflow executor, queue, or schedule truth store is introduced.

## Schedule data model

Add a workspace-owned workflow_schedules table with:

- id — UUID primary key.
- workspaceId — required workspace foreign key with cascade on hard workspace deletion.
- workflowId — required workflow foreign key with cascade on hard deletion; soft-deleted workflows are handled by the scheduler.
- type — CRON, INTERVAL, or ONE_TIME.
- enabled — whether future scheduling is active.
- cronExpression — nullable; populated only for CRON.
- intervalSeconds — nullable; populated only for INTERVAL.
- runAt — nullable UTC timestamp; populated only for ONE_TIME.
- timezone — required canonical IANA identifier.
- misfirePolicy — SKIP or FIRE_ONCE; recurring schedules use this policy, while one-time schedules use bounded single-fire behavior.
- input — bounded JSON-safe workflow input.
- nextRunAt — nullable UTC instant authoritative for the next eligible occurrence.
- lastTriggeredAt — nullable UTC processing timestamp for the last successfully triggered occurrence.
- lastProcessedAt — nullable UTC processing timestamp for the last triggered or skipped occurrence.
- createdBy — nullable user foreign key with SET NULL on user deletion; retained for provenance, not execution authorization.
- createdAt, updatedAt, and deletedAt.

The database adds type-specific constraints so a schedule cannot contain executable configuration for more than one type. API validation repeats the constraint with a strict discriminated union.

Recommended bounds are five-field minute-based cron, interval minimum 60 seconds, interval maximum one year, and schedule input bounded by the existing WORKFLOW_MAX_INPUT_CHARS and safe JSON rules.

No automatic occurrence-history deletion is introduced.

## Trigger occurrence data model

Add workflow_schedule_occurrences with:

- id — UUID primary key.
- workspaceId — required workspace foreign key.
- scheduleId — required schedule foreign key.
- scheduledFor — deterministic logical schedule instant in UTC.
- status — TRIGGERED, SKIPPED, or FAILED.
- workflowRunId — nullable workflow-run foreign key; populated only for TRIGGERED occurrences.
- reasonCode — nullable safe scheduling reason.
- processedAt — actual UTC time Flowyn processed the occurrence.
- createdAt.

Enforce UNIQUE(scheduleId, scheduledFor) and add indexes for schedule history, workspace history, and linked workflow runs.

Occurrence status describes scheduling, not workflow execution:

- TRIGGERED means a workflow run and outbox row were successfully created and linked.
- SKIPPED means scheduling intentionally did not create a workflow run.
- FAILED means schedule-trigger processing failed before a workflow run was created or linked. A downstream workflow failure never changes a TRIGGERED occurrence to FAILED; the linked workflow run owns that status.

## Time and schedule semantics

### CRON

Use cron-parser as a direct maintained runtime dependency rather than relying on BullMQ's transitive dependency. Accept only five-field expressions and reject malformed or six-field/seconds syntax.

The parser receives the configured IANA timezone and a UTC reference instant. Its returned occurrence is converted to and persisted as UTC.

### INTERVAL

Intervals represent fixed elapsed seconds. timezone is retained for configuration and display but does not change interval duration across DST transitions.

The first nextRunAt is calculated server-side from schedule creation or enable time. After processing, the next future occurrence is computed arithmetically without iterating through unbounded missed intervals.

### ONE_TIME

runAt is accepted as an explicit RFC3339 instant and stored as UTC. timezone is retained for display and UI context; it does not reinterpret an explicit instant.

One-time schedules are consumed exactly once logically. Whether the outcome is TRIGGERED or SKIPPED, the same transaction sets enabled=false and nextRunAt=null.

### Timezone and DST

Only IANA identifiers are accepted. Abbreviations such as EST, PST, and GMT are rejected.

Observed cron-parser behavior is made contractual by tests:

- Normal Asia/Kuala_Lumpur calculation produces deterministic UTC instants.
- Nonexistent spring-forward local times are skipped.
- Ambiguous fall-back local times are emitted once according to the parser's canonical behavior.
- Historical scheduledFor values are never reinterpreted after a schedule edit.

The implementation must not claim broader DST behavior than tests demonstrate.

## Misfire policy

Use a bounded global misfire grace period, configured as 60 seconds by default.

An occurrence due within the grace period is processed normally. If a recurring schedule is older than the grace period:

- SKIP records one bounded SKIPPED representation and advances nextRunAt to the first future occurrence.
- FIRE_ONCE creates at most one catch-up execution using the most recent eligible missed scheduled instant as scheduledFor, then advances nextRunAt to the first future occurrence.

For a five-minute schedule due at 10:00, 10:05, 10:10, and 10:15, with recovery at 10:17, FIRE_ONCE creates only the 10:15 occurrence and sets nextRunAt to 10:20.

scheduledFor is always the deterministic logical time. processedAt and lastProcessedAt record actual processing time and never replace scheduledFor.

One-time schedules use the same bounded single-fire rule and never backfill repeatedly.

## Schedule updates

Changing type, cron expression, interval, run time, timezone, or other timing fields:

1. Validates the complete candidate schedule.
2. Recomputes nextRunAt server-side.
3. Preserves all historical occurrences unchanged.
4. Never reinterprets historical scheduledFor values.
5. Never reuses a historical occurrence identity.

For recurring schedules, the new next occurrence is calculated from update time and does not replay historical occurrences. A processed one-time schedule cannot be rearmed by editing; creating a new schedule is required. No schedule revision column is needed because immutable occurrence identities plus transactional nextRunAt recomputation provide the required correctness.

## Scheduler process and transaction boundary

Add a dedicated scheduler process using the existing application image. It polls PostgreSQL at a bounded interval and supports multiple scheduler processes.

Each scheduler batch uses a short transaction with FOR UPDATE SKIP LOCKED to select due enabled, non-deleted schedules. The transaction may only:

- Lock due schedules.
- Determine the logical occurrence identity.
- Insert or reuse an occurrence.
- Create or reuse the workflow run and immutable snapshot.
- Insert the existing transactional outbox row.
- Link the occurrence to the run.
- Advance schedule state.
- Commit.

It must not execute workflow steps, call Ollama, invoke AgentRunner, wait for BullMQ, or perform arbitrary network operations.

No durable schedule claim lease is required because schedule locking and all state changes occur in one short transaction. A crash rolls back the lock and transaction. Redis heartbeat is liveness/observability only and is not a correctness mechanism.

The scheduler has a Redis heartbeat with its own key and health command. Redis restart can temporarily make the scheduler health check unavailable, but schedule definitions and due state remain in PostgreSQL and resume after Redis recovery.

## PostgreSQL versus BullMQ responsibility

PostgreSQL is authoritative for schedule definitions, nextRunAt, misfire state, occurrence identity, occurrence status, and occurrence-to-run linkage.

BullMQ remains responsible only for delivering workflow execution jobs after the PostgreSQL outbox is committed. BullMQ repeatable jobs and Job Schedulers are not used as schedule truth.

## Idempotency and concurrency

For every trigger, use both:

- UNIQUE(scheduleId, scheduledFor) on occurrences.
- A deterministic workflow idempotency key such as workflow-schedule:<scheduleId>:<scheduledFor>.

If two schedulers observe the same due schedule, PostgreSQL row locking and uniqueness ensure that only one logical occurrence is created. A retry reuses the existing occurrence or run. The system remains at-least-once for downstream workflow execution and does not claim exactly-once side effects.

## Workflow integration

The scheduler uses a reusable internal scheduled-run service layered over the Milestone 6 workflow service. It must not call WorkflowExecutor directly and must not duplicate snapshots, validation, outbox insertion, retries, leases, cancellation, or step execution.

At trigger time it revalidates schedule/workflow workspace ownership, workflow enabled and non-deleted status, agent ownership and enabled/non-deleted status, brand ownership, and knowledge retrieval workspace/brand filters.

The resulting run copies the current valid workflow version into its immutable snapshot. Later workflow edits do not affect it.

## Workspace automation principal

Scheduled execution uses a trusted internal discriminated principal:

~~~ts
type ExecutionPrincipal =
  | { kind: "user"; userId: string }
  | { kind: "workspace_automation"; workspaceId: string; scheduleId: string };
~~~

Only trusted server-side scheduler/workflow code may construct the automation variant. It is never accepted from API JSON, headers, query parameters, client state, workflow input, or schedule input.

The automation principal is not an administrator. It may only execute the already-approved schedule/workflow in its workspace. It cannot perform administrative CRUD or broaden tool permissions.

Scheduled workflow runs use the existing nullable startedBy field with NULL; they do not fabricate a user. The occurrence supplies schedule provenance to the worker. Generation logs and subordinate agent runs likewise use nullable user identity fields where appropriate. Scheduler audit events use a nullable actor and safe principal metadata.

The existing user-only identity assumption in workflow AI/Agent execution must be replaced with narrow principal-aware service interfaces. User-triggered Milestone 6 paths continue using their authenticated user principal unchanged.

Principal-aware paths must preserve workspace ownership checks, workflow/agent/brand enabled checks, workspace/brand-scoped knowledge retrieval, existing policy/output bounds, and safe audit/history behavior.

Creator removal is explicitly supported. A schedule remains valid when its creator leaves or is removed from the workspace, provided the schedule and referenced workflow remain valid and enabled.

## Disabled and deleted resources

- Disabled schedules create no occurrences.
- Soft-deleted schedules are excluded from due selection and retain history.
- Disabled workflows create SKIPPED occurrences with SCHEDULE_WORKFLOW_DISABLED; recurring schedules advance normally.
- Soft-deleted workflows create SKIPPED occurrences with SCHEDULE_WORKFLOW_DELETED and disable the schedule to prevent endless skipped history.
- One-time schedules are consumed after either TRIGGERED or SKIPPED.

No workflow run or outbox row is created for a skipped occurrence.

## Authorization and isolation

Schedule permissions are:

- MEMBER: read schedules and occurrence history.
- ADMIN/OWNER: create, update, enable, disable, and delete schedules.

Members do not create personal schedules in Milestone 7.

All protected schedule resources resolve their owning workspace before membership checks. Every query includes workspace ownership conditions where applicable. The UI is never an authorization source.

Scheduled runs are workspace automation runs; members cannot cancel them because they do not have a startedBy user identity. Admins and owners may cancel cancellable scheduled runs through the existing workflow cancellation path.

## API surface

Add thin route handlers:

~~~text
GET    /api/workflow-schedules?workspaceId=...
POST   /api/workflow-schedules
GET    /api/workflow-schedules/:id
PATCH  /api/workflow-schedules/:id
DELETE /api/workflow-schedules/:id
POST   /api/workflow-schedules/:id/enable
POST   /api/workflow-schedules/:id/disable
GET    /api/workflow-schedules/:id/occurrences?limit=...
~~~

Bodies use strict discriminated Zod schemas. Occurrence history uses bounded limits. Linked workflow runs are opened through the existing workflow-run history endpoint.

Suggested safe errors include SCHEDULE_NOT_FOUND, SCHEDULE_INVALID_CRON, SCHEDULE_INVALID_INTERVAL, SCHEDULE_INVALID_TIMEZONE, SCHEDULE_INVALID_RUN_AT, SCHEDULE_DISABLED, SCHEDULE_WORKFLOW_DISABLED, SCHEDULE_OCCURRENCE_CONFLICT, SCHEDULE_INPUT_LIMIT, and SCHEDULE_TRIGGER_FAILED.

## UI

Add a focused dashboard schedule panel, not a visual workflow canvas. It supports selecting an existing workflow, choosing a schedule type, configuring timing and timezone, entering bounded workflow input, selecting recurring misfire policy, enabling/disabling, inspecting next and last processing times, viewing occurrence history, and opening a linked workflow run.

Correctness and clear status are more important than calendar polish.

## Audit logging

Reuse recordAuditEvent with:

- workflow_schedule.created
- workflow_schedule.updated
- workflow_schedule.enabled
- workflow_schedule.disabled
- workflow_schedule.deleted
- workflow_schedule.triggered
- workflow_schedule.skipped

CRUD events use the authenticated actor. Trigger/skipped events use a nullable actor and safe metadata containing only IDs, principal type, status, reason code, and bounded timing facts. Schedule input, workflow input, prompts, model output, knowledge chunks, credentials, and secrets are never audited.

Occurrence history is the detailed trigger history; audit logs are not a duplicate high-volume execution log.

## Failure and recovery

- Crash before the due-schedule transaction commits: PostgreSQL rolls back and the schedule remains due.
- Crash after commit before queue delivery: the existing outbox dispatcher recovers the pending dispatch.
- Redis restart: schedule truth remains available in PostgreSQL; heartbeat and queue delivery recover independently.
- PostgreSQL outage: the scheduler does not create partial state and retries on the next poll.
- Worker outage: workflow runs remain queued/outboxed until worker recovery.
- Duplicate scheduler processing: occurrence and workflow idempotency constraints prevent duplicate logical runs.
- Downstream workflow failure: the linked workflow run records its own failure; the occurrence remains TRIGGERED.
- Scheduling-specific deterministic failure: the occurrence may be FAILED with a safe reason code, without pretending a workflow ran.

## Docker/runtime changes

Add a scheduler service using the existing docker/app.Dockerfile image and trusted environment. It depends on PostgreSQL and Redis, uses restart: unless-stopped, has a Redis-heartbeat health check, and does not introduce a new database, Redis instance, Ollama instance, or volume.

Add scheduler environment settings with bounded defaults:

- SCHEDULER_POLL_INTERVAL_MS=5000
- SCHEDULER_BATCH_SIZE=25
- SCHEDULER_HEARTBEAT_TTL_SECONDS=30
- SCHEDULE_MISFIRE_GRACE_SECONDS=60
- SCHEDULE_MIN_INTERVAL_SECONDS=60
- SCHEDULE_MAX_INTERVAL_SECONDS=31536000

The scheduler does not depend on Ollama because it never executes workflow steps.

## Migration strategy

Update lib/database/schema.ts, generate a migration with npm run db:generate, and review the SQL. The migration adds schedule and occurrence tables, constraints, foreign keys, uniqueness, and indexes without changing or resetting existing workflow/agent/history data.

Run the migration against the existing database and a clearly named temporary clean database. Do not delete Docker volumes or reset PostgreSQL.

## Testing strategy

Unit tests cover:

- Five-field cron enforcement and invalid syntax.
- IANA timezone validation.
- Asia/Kuala_Lumpur calculation and UTC conversion.
- DST spring-forward and fall-back behavior observed from the parser.
- Interval bounds and arithmetic next-run calculation.
- One-time validation and consumption.
- Input bounds and unsafe JSON keys.
- SKIP and FIRE_ONCE misfires.
- Schedule updates and historical occurrence preservation.
- Disabled/deleted schedule and workflow behavior.
- Occurrence uniqueness and deterministic idempotency.
- Automation-principal restrictions.

Service and route tests cover CRUD, roles, workspace isolation, occurrence history, linked run access, creator removal, schedule cancellation rules, and safe errors.

Regression tests cover manual workflow runs, manual AI generation, manual AgentRunner execution, workflow AGENT and AI_GENERATE steps, BrandContext/RAG isolation, and all Milestone 1–6 tests.

An opt-in real integration uses PostgreSQL, Redis, BullMQ, the scheduler, and the worker. It verifies persistence, due detection, occurrence uniqueness, workflow snapshots, outbox creation, queue delivery, completion, one-time no-duplicate behavior, duplicate scheduler processing, creator removal, automation-principal execution, restart/recovery, and cross-workspace isolation. Ollama is used for at least one scheduled AI/Agent path when practical.

Extend scripts/verify-local.ps1 to verify scheduler health, schedule schema, occurrence uniqueness, real scheduled execution, duplicate safety, existing migrations, clean migrations, and all existing M1–M6 checks.

## Ordered implementation outline

1. Add failing tests for cron, timezone, DST, intervals, one-time schedules, misfires, and safe inputs.
2. Add schedule and occurrence schema, generated migration, policy configuration, and validation/calculation services.
3. Add transactional occurrence processing and reusable scheduled workflow-run creation over the existing snapshot/outbox path.
4. Add narrow workspace-automation principal interfaces across workflow, AI, BrandContext/RAG, AgentRunner, and controlled tools, preserving user paths.
5. Add scheduler process, PostgreSQL polling/locking, heartbeat, health command, environment configuration, and Compose service.
6. Add schedule CRUD, enable/disable, occurrence-history APIs, authorization actions, and audit events.
7. Add the focused dashboard schedule-management UI.
8. Add real scheduler/worker/BullMQ/PostgreSQL/Redis/Ollama integration coverage and verification-script checks.
9. Update README, architecture, security, AI, and setup documentation; run all acceptance checks and commit locally.

## Security review conclusions

The architecture does not introduce arbitrary execution or external network capabilities. The main security-sensitive change is the internal workspace-automation principal. It is constrained to an already-authorized schedule/workflow, cannot be supplied by a client, does not grant administrative permissions, and is validated at trigger and execution time.

The implementation must not use the current startedBy ?? "" fallback for scheduled AI/Agent execution. An absent principal must fail closed, not become an empty user identity.

## Verification and completion gates

Before the final implementation commit, run:

~~~powershell
npm run typecheck
npm run lint
npm test -- --run
npm run build
docker compose config
docker compose up -d --build
docker compose ps
.\scripts\verify-local.ps1
~~~

Also run the opt-in real scheduler integration, verify existing and clean database migrations, confirm scheduler heartbeat, and confirm all Milestones 1–6 remain healthy. Do not commit the implementation if required verification fails. Do not push or start Milestone 8.
