# Durable Workflow Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Implement Milestone 7 as a durable, workspace-isolated scheduling layer for existing Flowyn workflows, supporting CRON, INTERVAL, and ONE_TIME schedules while reusing the existing workflow snapshot, outbox, BullMQ, worker, authorization, audit, PostgreSQL, Redis, Ollama, and error-handling architecture.

**Architecture:** PostgreSQL is the authoritative schedule and occurrence store. A dedicated scheduler process claims due schedules in short \`FOR UPDATE SKIP LOCKED\` transactions, records an idempotent occurrence, creates the existing durable workflow run/snapshot/outbox records, and advances the schedule. The scheduler never executes workflow steps or calls Ollama. The existing worker executes scheduled runs through the existing executor and controlled Agent runtime. Scheduled execution uses a workspace-scoped internal automation principal with no fake user account and a nullable \`startedBy\`.

**Tech Stack:** Next.js, TypeScript, Drizzle ORM, PostgreSQL, Redis, BullMQ, Ollama through the existing \`LLMProvider\`, Zod, Vitest, Tailwind, shadcn/ui, Docker Compose, and \`cron-parser\`.

**Spec:** [docs/superpowers/specs/2026-08-14-milestone-7-scheduling-automation-triggers-design.md](C:/Users/User/OneDrive/Flowyn/docs/superpowers/specs/2026-08-14-milestone-7-scheduling-automation-triggers-design.md)

## Global Constraints

- Implement Milestone 7 only. Do not implement webhooks, external integrations, approvals, editor functionality, or any Milestone 8 capability.
- Preserve all Milestones 1–6 behavior and existing development data.
- Do not reset PostgreSQL, Redis, or Ollama volumes.
- Do not add arbitrary code execution, shell execution, unrestricted HTTP, filesystem access, \`eval\`, \`Function\`, dynamic executable modules, or a second agent engine.
- Keep route handlers thin: authenticate, validate, authorize, call a service, and return a typed response.
- Keep scheduling, occurrence claiming, and run creation in \`lib/*\` services.
- Every request body has a Zod schema.
- Every schedule query is constrained by the authenticated workspace membership and the requested resource workspace.
- Manual user-initiated workflow behavior remains user-principal behavior.
- Scheduled workflow behavior is the only path allowed to use the workspace automation principal.
- Use generated and reviewed Drizzle migrations.
- Do not upgrade unrelated dependencies.
- Do not push changes.
- Do not run \`npm audit fix --force\`.
- Run tests before claiming completion:
  \`npm run typecheck\`, \`npm run lint\`, \`npm test -- --run\`, and \`npm run build\`.
- For runtime acceptance, run \`docker compose config\`, \`docker compose up -d --build\`, \`docker compose ps\`, and the full local verification script without deleting volumes.

## Task 1: Add scheduling domain contracts, policy validation, and next-run calculation

Write the tests first and keep the pure scheduling layer independent of HTTP, React, Ollama, BullMQ, and database clients.

Files:

- Create \`lib/schedules/types.ts\`.
- Create \`lib/schedules/policy.ts\`.
- Create \`lib/schedules/validation.ts\`.
- Create \`lib/schedules/calculator.ts\`.
- Add \`cron-parser\` as a direct runtime dependency in \`package.json\` and update \`package-lock.json\` using the repository package-manager convention.
- Add focused tests in \`tests/schedule-validation.test.ts\` and \`tests/schedule-calculator.test.ts\`.
- Extend \`lib/env.ts\` with the scheduler and schedule policy settings documented in the approved specification.
- Extend \`.env.example\` with documented safe local defaults.

Contracts:

- Define \`ScheduleType\` as \`CRON | INTERVAL | ONE_TIME\`.
- Define \`MisfirePolicy\` as \`SKIP | FIRE_ONCE\`.
- Define \`ScheduleStatus\` as \`TRIGGERED | SKIPPED | FAILED\`.
- Define a typed schedule input and a typed persisted schedule projection.
- Define bounded calculation results that distinguish a normal next run, a skipped stale occurrence, a single fire-once occurrence, and a terminal one-time schedule.
- Use UTC \`Date\` values for persisted instants. Keep the configured IANA timezone as schedule metadata.
- Require exactly five cron fields.
- Require a valid IANA timezone and validate it with the runtime timezone database.
- Require interval values between \`SCHEDULE_MIN_INTERVAL_SECONDS\` and \`SCHEDULE_MAX_INTERVAL_SECONDS\`; the default minimum is 60 seconds.
- Require an RFC3339 one-time \`runAt\` with an explicit timezone or UTC offset.
- Require \`FIRE_ONCE\` and \`SKIP\` to be explicit in the validated persisted representation.
- Require finite, bounded JSON input and reject oversized request payloads through the existing request validation/error path.
- Preserve the existing workflow input contract rather than inventing a second input format.

Calculator behavior:

- Implement \`calculateNextRunAt\` with \`cron-parser\` and an explicit current instant.
- Pass the configured IANA timezone to cron calculation rather than relying on the process timezone.
- Calculate interval schedules in UTC from the prior scheduled instant.
- Treat one-time schedules as terminal after their scheduled instant has been consumed.
- Implement bounded misfire handling: \`SKIP\` records the missed scheduled instant as skipped and advances; \`FIRE_ONCE\` selects only the most recent eligible missed instant within the configured grace window and advances past older missed slots.
- Never loop over an unbounded historical interval or cron range.
- Define and test the approved DST behavior against the installed \`cron-parser\` version for spring-forward and fall-back transitions. Encode the observed behavior in tests so a dependency change fails loudly.
- Test exact boundary behavior at the grace window, interval minimum/maximum, one-time consumption, malformed cron, invalid timezone, and impossible dates.

Exit criteria:

- The new tests fail before implementation and pass after implementation.
- The calculator has no database or network imports.
- \`npm run typecheck\` passes after these pure modules are added.

## Task 2: Add schedule and occurrence persistence with a reviewed migration

Files:

- Modify \`lib/database/schema.ts\`.
- Generate the next migration with \`npm run db:generate\`.
- Review the generated SQL and migration metadata under \`db/migrations\`.
- Add \`tests/schedule-schema.test.ts\` for the schema-level contracts that can be tested without destructive database work.

Schema:

- Add \`workflow_schedules\` with:
  - UUID primary key.
  - \`workspace_id\` foreign key.
  - \`workflow_id\` foreign key.
  - \`type\` enum.
  - \`enabled\` boolean.
  - nullable \`cron_expression\`, \`interval_seconds\`, and \`run_at\` fields constrained by the schedule type at the service layer.
  - \`timezone\`.
  - \`misfire_policy\`.
  - JSONB \`input\`.
  - nullable \`next_run_at\`, \`last_triggered_at\`, and \`last_processed_at\`.
  - nullable \`created_by\` foreign key with user deletion preserving the schedule.
  - timestamps and nullable soft-delete timestamp.
- Add \`workflow_schedule_occurrences\` with:
  - UUID primary key.
  - \`workspace_id\` foreign key.
  - \`schedule_id\` foreign key.
  - \`scheduled_for\` UTC instant.
  - \`status\` enum.
  - nullable \`workflow_run_id\` foreign key.
  - nullable bounded \`reason_code\`.
  - nullable \`processed_at\`.
  - \`created_at\`.
- Add a unique constraint on \`(schedule_id, scheduled_for)\`.
- Add indexes for due enabled schedules, workspace/schedule history, and occurrence lookup by workflow run.
- Preserve historical occurrences when a schedule is soft-deleted.
- Do not introduce database-level JSON policy that duplicates the Zod/domain validation; retain database types and service-level validation.
- Use the repository’s existing UUID, timestamp, JSONB, enum, and foreign-key conventions.

Migration procedure:

- Run the repository migration generator rather than hand-writing the migration.
- Review every generated statement for destructive changes, unintended table rewrites, missing indexes, and correct foreign-key delete behavior.
- Apply the migration to the existing PostgreSQL development database without dropping or resetting any volume.
- Record the migration name and resulting schema in the implementation notes.
- Add an assertion to the local verification script that the new tables and unique constraint exist.

Exit criteria:

- The generated migration is tracked and reviewed.
- Existing migrations remain unchanged.
- Existing M1–M6 schema checks still pass.
- A fresh migration run and an already-initialized database both converge to the same schema.

## Task 3: Add the workspace automation principal and principal-aware workflow execution

Files:

- Create \`lib/security/principal.ts\`.
- Modify \`lib/workflows/types.ts\`.
- Modify \`lib/workflows/service.ts\`.
- Modify \`lib/workflows/executor.ts\`.
- Modify \`lib/ai/types.ts\` and \`lib/ai/service.ts\`.
- Modify \`lib/knowledge/brand-context.ts\` and \`lib/knowledge/retrieval.ts\`.
- Modify \`lib/agents/runner.ts\`, \`lib/agents/service.ts\`, and the controlled agent tool modules that currently use \`context.userId\`.
- Add focused tests in \`tests/execution-principal.test.ts\`, \`tests/scheduled-workflow-run.test.ts\`, and \`tests/manual-workflow-regression.test.ts\`.

Principal model:

- Define:
  \`ExecutionPrincipal = { kind: "user"; userId: string } | { kind: "workspace_automation"; workspaceId: string; scheduleId: string }\`.
- Keep \`requireUser\`, workspace membership checks, and existing manual authorization unchanged.
- Never create or impersonate a user record for automation.
- Scheduled workflow runs use \`startedBy = NULL\` and carry their principal through the execution context and schedule/occurrence linkage.
- Treat a missing principal as an internal invariant failure. Do not convert it to an empty string or anonymous user.
- Ensure the automation principal is only constructed by the internal schedule-trigger service after it has verified the schedule, occurrence, workspace, and workflow relationship.

Workflow run creation:

- Refactor the existing manual \`createWorkflowRun\` path around a shared, transaction-aware internal creation function without changing its public authorization behavior.
- Keep manual calls requiring the authenticated user and the existing workflow action.
- Add a narrow internal \`createScheduledWorkflowRun\` function accepting the verified schedule ID, occurrence ID, workspace ID, workflow ID, validated input, deterministic idempotency key, and database transaction.
- Reuse the existing workflow validation, current-version snapshot, run row, outbox row, audit row, and idempotency behavior.
- Store the schedule/occurrence relationship as part of the schedule trigger transaction; do not create a second run/outbox abstraction.
- Use \`workflow-schedule:<scheduleId>:<scheduledFor>\` as the deterministic idempotency key.
- Ensure a duplicate trigger returns the already-created logical run or the existing occurrence result and never creates a second run.

AI, RAG, and agent integration:

- Extend internal generation and agent execution contexts to carry an \`ExecutionPrincipal\` while preserving the existing user-facing API shape.
- For user principals, continue recording the user ID and using existing membership checks.
- For workspace automation principals, use the verified workspace and schedule scope for brand/knowledge/agent lookup; do not accept a client-supplied workspace or user ID.
- Add narrow workspace-scoped internal loaders for referenced brands and agents where existing loaders are user-membership-specific. Keep public user loaders unchanged.
- Keep the \`LLMProvider\` interface as the only model boundary. Scheduled execution must still use the configured Ollama provider through that interface.
- Keep controlled agent tool permissions explicit and deny-by-default. Agent tools may access only the verified workspace-scoped brand/RAG resources allowed by the existing workflow/agent configuration.
- Do not add shell, HTTP, filesystem, SQL, eval, Function, or dynamic-module capabilities.
- Ensure generation logs and agent run audit fields remain nullable for automation and never expose credentials.

Executor behavior:

- Replace the current \`run.startedBy ?? ""\` fallback with explicit principal resolution.
- Resolve a user principal for manual runs and the linked workspace automation principal for scheduled runs.
- Fail closed before executing an AI or agent step when neither principal can be resolved.
- Preserve non-AI workflow step execution and existing run lease/retry/terminal-state semantics.

Exit criteria:

- Manual workflow tests pass unchanged.
- Scheduled workflow unit tests prove nullable \`startedBy\`, deterministic idempotency, workspace-scoped resource access, and no fake user creation.
- Agent and RAG tests prove both principal variants use the same controlled interfaces and cannot cross workspace boundaries.
- No existing public method silently accepts an unverified client user or workspace ID.

## Task 4: Implement schedule CRUD, occurrence history, and the atomic due-schedule processor

Files:

- Create \`lib/schedules/service.ts\`.
- Create \`lib/schedules/processor.ts\`.
- Create \`lib/schedules/repository.ts\` if a repository boundary is needed to keep transaction queries out of route handlers.
- Modify \`lib/audit/service.ts\` and the existing audit action/resource types.
- Add tests in \`tests/schedule-service.test.ts\`, \`tests/schedule-processor.test.ts\`, and \`tests/schedule-idempotency.test.ts\`.

CRUD service:

- Implement workspace-scoped list/get/create/update/delete operations.
- Revalidate the target workflow belongs to the same workspace on create and update.
- Validate schedule type-specific fields and workflow input with the pure validation layer.
- Recompute \`nextRunAt\` on create and on updates to timing, timezone, type, or misfire policy.
- Preserve historical occurrences on update and soft delete.
- Enforce one-time terminal behavior: a consumed one-time schedule cannot be re-enabled or assigned a new run time through an ordinary update.
- Keep deleted schedules out of normal list/get operations while retaining their occurrence history for audit and recovery.
- Ensure update and enable/disable operations are safe under concurrent requests.

Atomic processor:

- Implement \`processDueSchedules(now, batchSize)\` as a bounded loop that selects enabled, non-deleted due schedules with \`FOR UPDATE SKIP LOCKED\`.
- Keep each schedule transaction short and database-only.
- In the transaction, verify the schedule/workflow/workspace relationship, calculate the due occurrence, insert the unique occurrence, and decide one of:
  - \`TRIGGERED\`: create the existing workflow run, snapshot, outbox, and schedule linkage.
  - \`SKIPPED\`: record the bounded reason code, advance the schedule, and do not enqueue work.
  - \`FAILED\`: record a bounded internal processing reason for a deterministic trigger failure, advance or disable only according to the schedule type, and leave a recoverable audit trail.
- Advance \`nextRunAt\`, \`lastTriggeredAt\`, and \`lastProcessedAt\` in the same transaction as the occurrence and run creation.
- Set one-time schedules to \`enabled = false\` and \`nextRunAt = NULL\` after either a triggered or skipped occurrence.
- For a disabled referenced workflow, record \`SCHEDULE_WORKFLOW_DISABLED\`; for a deleted/missing referenced workflow, record \`SCHEDULE_WORKFLOW_DELETED\` and disable the schedule.
- For recurring misfires, apply the bounded \`SKIP\` or \`FIRE_ONCE\` policy without creating unbounded occurrence rows.
- Write bounded schedule audit metadata containing schedule ID, workflow ID, occurrence ID, scheduled instant, type, and outcome. Never put prompt content, credentials, or full workflow input in audit metadata.
- Never call Ollama, the AgentRunner, external services, or BullMQ execution code directly from the scheduler transaction. The transaction may create the existing outbox row that the existing dispatcher publishes to BullMQ.

Concurrency and recovery:

- Use the unique occurrence key as the final duplicate barrier.
- Make a transaction rollback leave no partial occurrence, run, snapshot, outbox, or schedule advancement.
- Make a committed trigger recoverable by the existing outbox dispatcher and worker.
- Make an outbox publish failure recoverable by the existing dispatcher retry path.
- Make a worker failure use existing durable run retry/lease behavior; the scheduler must not create a second occurrence for the same scheduled instant.
- Keep scheduler heartbeat liveness separate from schedule truth.

Exit criteria:

- Unit tests cover due selection, concurrent claim behavior, occurrence uniqueness, all misfire policies, disabled/deleted workflows, one-time terminal state, updates, soft deletion, and transaction rollback.
- A duplicate processor invocation produces one occurrence and one logical run.
- Existing workflow outbox/worker code remains the execution path.

## Task 5: Add the dedicated scheduler runtime and Docker integration

Files:

- Create the scheduler process entrypoint under \`worker/workflow-scheduler.ts\`.
- Create or extend the scheduler heartbeat implementation under \`lib/schedules/heartbeat.ts\`, reusing the existing heartbeat conventions.
- Add a focused runtime test in \`tests/scheduler-runtime.test.ts\`.
- Modify \`package.json\` and \`package-lock.json\` with \`scheduler\` and scheduler health commands.
- Modify \`docker-compose.yml\`.
- Modify \`.env.example\`.
- Extend the existing health/verification script with scheduler checks.

Runtime:

- Start one bounded scheduler polling loop with configurable \`SCHEDULER_POLL_INTERVAL_MS\`, \`SCHEDULER_BATCH_SIZE\`, and \`SCHEDULER_HEARTBEAT_TTL_SECONDS\`.
- On each tick, call the database-only due processor and then update scheduler heartbeat state.
- Handle SIGINT and SIGTERM by stopping new polls, allowing the current short transaction to finish, and exiting cleanly.
- Log structured, bounded metrics: poll start/end, claimed count, triggered count, skipped count, failed count, duration, and error class. Do not log prompt/input contents or credentials.
- Keep scheduler errors from terminating the process for transient database/Redis health issues; use bounded retry/backoff and continue polling.
- Surface fatal configuration errors and exit nonzero.
- Do not use BullMQ repeatable jobs for schedule truth.

Docker:

- Add a \`scheduler\` service using the existing application image/build context.
- Reuse the existing Postgres and Redis services, environment configuration, network, and health-check dependencies.
- Do not add a database, Redis instance, Ollama instance, or volume.
- Use the same migration/startup prerequisite as the existing worker and app.
- Keep the existing \`worker\` service unchanged except for shared environment variables needed by the schedule-aware workflow executor.
- Ensure \`docker compose config\` renders the scheduler command and dependency graph correctly.

Health and shutdown:

- Extend the existing worker health conventions with a scheduler heartbeat check.
- The scheduler health command must distinguish a running process with a fresh heartbeat from a stale heartbeat.
- Do not treat a stale scheduler heartbeat as proof that PostgreSQL schedule state was lost.

Exit criteria:

- The scheduler starts in Docker and remains running.
- Two scheduler processes can run concurrently without duplicate occurrence/run creation.
- Stopping and restarting the scheduler catches up according to the configured bounded misfire policy.
- Existing app, worker, PostgreSQL, Redis, and Ollama services remain healthy.

## Task 6: Add authorization, audit, typed APIs, and workspace-isolated schedule history

Files:

- Modify \`lib/authz/authorization.ts\` using the repository’s existing \`WorkspaceAction\` pattern.
- Modify audit action/resource unions and audit helper types in \`lib/audit/service.ts\`.
- Create \`app/api/workflow-schedules/route.ts\`.
- Create \`app/api/workflow-schedules/[id]/route.ts\`.
- Create \`app/api/workflow-schedules/[id]/enable/route.ts\`.
- Create \`app/api/workflow-schedules/[id]/disable/route.ts\`.
- Create \`app/api/workflow-schedules/[id]/occurrences/route.ts\`.
- Create request schemas in \`lib/schedules/http-schemas.ts\`.
- Add route/service tests in \`tests/schedule-authorization.test.ts\`, \`tests/schedule-routes.test.ts\`, and \`tests/schedule-cross-workspace.test.ts\`.

Authorization:

- Reuse \`requireUser\`, \`requireWorkspaceMember\`, and \`requireWorkspaceAction\`.
- Allow workspace MEMBER users to list/get schedules and read occurrence history.
- Allow workspace ADMIN/OWNER users to create, update, enable, disable, and delete schedules.
- Do not allow personal schedules outside a workspace.
- Resolve workspace access from the server-side authenticated session and membership, never from a trusted client user/workspace combination.
- Verify the schedule, workflow, occurrence, and returned run all belong to the same workspace before returning data.
- Return the existing typed \`AppError\`/error response format for unauthenticated, forbidden, missing, malformed, and conflict cases.
- Do not return credentials or internal provider configuration.

API contracts:

- \`GET /api/workflow-schedules\`: list schedules in the selected authorized workspace, with bounded pagination/filtering.
- \`POST /api/workflow-schedules\`: validate body, require create action, verify workflow ownership, create schedule, and return a typed schedule.
- \`GET /api/workflow-schedules/:id\`: return one authorized schedule.
- \`PATCH /api/workflow-schedules/:id\`: validate partial timing/input/status changes, require update action, and return the updated schedule.
- \`DELETE /api/workflow-schedules/:id\`: require delete action and soft-delete the schedule.
- \`POST /api/workflow-schedules/:id/enable\` and \`/disable\`: require the matching administrative action and return the updated schedule.
- \`GET /api/workflow-schedules/:id/occurrences\`: return bounded, workspace-checked history with outcome, reason, scheduled instant, and linked run ID.
- Keep route responses serializable and typed. Use existing response helpers.

Audit:

- Add actions \`workflow_schedule.created\`, \`workflow_schedule.updated\`, \`workflow_schedule.enabled\`, \`workflow_schedule.disabled\`, \`workflow_schedule.deleted\`, \`workflow_schedule.triggered\`, and \`workflow_schedule.skipped\`.
- Record user actor IDs for user API actions and nullable actor IDs for scheduler actions.
- Include only bounded metadata: IDs, schedule type, scheduled instant, status/reason, and safe field names.
- Never audit full input, prompts, model responses, credentials, or raw provider payloads.
- Ensure scheduler audit writes are workspace-scoped and do not require a fake user.

Exit criteria:

- Cross-workspace reads, writes, occurrence access, and run access fail closed.
- A member can inspect history but cannot mutate a schedule.
- An admin/owner can mutate only schedules in a workspace where they hold the required action.
- API tests cover malformed bodies, missing membership, forbidden actions, soft-deleted resources, pagination bounds, and safe audit metadata.

## Task 7: Add the schedule management UI using existing dashboard and shadcn patterns

Files:

- Create \`components/forms/schedule-panel.tsx\`.
- Modify the existing dashboard page/component that renders workflow management.
- Reuse existing shadcn/ui form, button, card, select, input, badge, alert, and table primitives.
- Add UI-focused tests in \`tests/schedule-panel.test.tsx\` if the repository’s existing React test setup supports component rendering; otherwise add a typed route-contract test that exercises the same display states.

UI behavior:

- Add a schedule panel to the existing workflow workspace view rather than creating a second dashboard or navigation system.
- Show schedule type, enabled state, timezone, next run, last outcome, and recent occurrence state.
- Allow authorized admins/owners to create, edit, enable, disable, and soft-delete schedules.
- Show read-only schedule details and occurrence history to members.
- Render type-specific controls:
  - five-field cron and IANA timezone for CRON;
  - interval seconds for INTERVAL;
  - RFC3339 run time for ONE_TIME.
- Render misfire policy explicitly and explain the bounded SKIP/FIRE_ONCE behavior in concise UI text.
- Validate obvious input errors client-side for usability but rely on the server Zod/domain validation for security.
- Do not allow the UI to supply a user ID, automation principal, arbitrary workflow ID outside the selected workspace, or hidden authorization flags.
- Display safe API errors using existing app error response conventions.
- Keep all UI data workspace-scoped through existing dashboard workspace selection.
- Do not add workflow editor, webhook, integration, approval, or arbitrary tool configuration UI.

Exit criteria:

- The panel works with the existing dashboard layout and styling.
- Members cannot see mutation controls.
- An admin/owner can create and toggle a schedule through the real APIs.
- The UI handles one-time consumed, deleted, skipped, failed, and stale-scheduler states without implying false success.

## Task 8: Add end-to-end verification, documentation, and operational runbooks

Files:

- Add database/runtime integration tests under \`tests/integration/scheduling.test.ts\`.
- Add BullMQ/scheduler/worker integration coverage under \`tests/integration/scheduler-worker.test.ts\`.
- Add the scheduled AI/agent integration test described in the specification using the configured Ollama test model when the local runtime is available.
- Modify \`scripts/verify-local.ps1\`.
- Update \`README.md\`.
- Update the existing architecture documentation.
- Update the existing setup/local development documentation.
- Update the existing security documentation.
- Update the existing AI/agent documentation.
- Update the existing workflow/database/migration/Docker/verification documentation that currently describes M1–M6.

Integration scenarios:

- Create a CRON, INTERVAL, and ONE_TIME schedule in a real PostgreSQL workspace.
- Verify schedule and occurrence rows, the unique occurrence constraint, current workflow snapshot, deterministic idempotency key, outbox row, Redis/BullMQ dispatch, worker execution, and terminal run state.
- Run two scheduler instances against the same due schedule and prove one occurrence and one logical run.
- Stop the scheduler, advance a test clock or use a short test interval within policy, restart it, and verify bounded misfire behavior.
- Verify one-time schedules disable themselves after both triggered and skipped outcomes.
- Disable or soft-delete the referenced workflow and verify the specified skipped reason and recurring/one-time state.
- Remove the schedule creator’s workspace membership and verify future scheduled runs continue with nullable \`startedBy\`.
- Verify scheduled AI and controlled Agent steps use the workspace automation principal, the existing \`LLMProvider\`, BrandContext/RAG, and deny-by-default tools.
- Attempt cross-workspace schedule, workflow, occurrence, brand, knowledge, agent, and run access and verify failure.
- Preserve and rerun the full M1–M6 regression suite.

Verification script:

- Keep existing checks intact.
- Add checks for scheduler service status, fresh heartbeat, schedule tables, unique occurrence constraint, schedule API health, and a real schedule-to-worker smoke test.
- Use explicit failure handling for missing Docker, Node, npm, PostgreSQL, Redis, or Ollama prerequisites.
- Do not delete volumes or reset the database.
- Print concise evidence for each check and a final pass/fail result.

Documentation:

- Document the data model and authoritative ownership of schedule truth.
- Document the scheduler/worker/outbox sequence and recovery behavior.
- Document the automation principal and nullable actor semantics.
- Document CRON timezone/DST behavior, interval bounds, one-time semantics, and misfire policies.
- Document authorization and workspace isolation for APIs and history.
- Document Docker commands, environment variables, scheduler health, shutdown, and troubleshooting.
- Document how to run unit, integration, and full local verification tests.
- State explicitly that Milestone 8 is not implemented.

Exit criteria:

- All required unit, integration, build, Docker, and verification checks pass, or a concrete local prerequisite is reported with evidence.
- Documentation matches the implementation and contains no stale claim that scheduler truth lives in BullMQ.

## Task 9: Self-review, final verification, and local implementation commit

Before committing implementation:

- Run \`git diff --check\`.
- Inspect \`git status --short\` and confirm only Milestone 7 files are changed.
- Review the generated migration SQL and verify it is non-destructive.
- Search the diff for \`eval\`, \`Function\`, shell execution, arbitrary HTTP, dynamic executable imports, credential logging, and client-trusted user/workspace IDs.
- Search for duplicate authentication, authorization, AI provider, agent runtime, queue, worker, audit, or error-response abstractions.
- Search for any Milestone 8 implementation or references that imply it is available.
- Run:
  \`npm run typecheck\`
  \`npm run lint\`
  \`npm test -- --run\`
  \`npm run build\`
  \`docker compose config\`
  \`docker compose up -d --build\`
  \`docker compose ps\`
  \`.\scripts\verify-local.ps1\`
- Verify the app, worker, scheduler, PostgreSQL, Redis, and Ollama containers remain healthy after the test run.
- Verify the schedule API, occurrence history, and Ollama API with an actual HTTP request.
- Verify a scheduled run reaches the existing worker and completes or fails durably according to the existing run semantics.
- Do not claim completion from compile-only checks.

Commit:

- Stage only the reviewed Milestone 7 implementation, migration, tests, documentation, and configuration.
- Create one local conventional commit with an imperative message such as \`feat: add durable workflow scheduling\`.
- Do not push.
- Do not amend the earlier design/plan commit.
- Do not start Milestone 8.

## Final Acceptance Checklist

- [ ] Approved Milestone 7 spec and this plan are committed locally.
- [ ] \`cron-parser\` is a direct dependency and timezone/DST behavior is tested.
- [ ] Schedule and occurrence schema exists through a reviewed generated migration.
- [ ] PostgreSQL is authoritative for schedules and occurrences.
- [ ] Due schedules use short \`FOR UPDATE SKIP LOCKED\` transactions.
- [ ] Occurrence uniqueness and deterministic idempotency prevent duplicate runs.
- [ ] CRON, INTERVAL, and ONE_TIME behavior is covered.
- [ ] SKIP and FIRE_ONCE misfires are bounded and covered.
- [ ] Scheduled runs reuse workflow snapshots, outbox, BullMQ, worker, AgentRunner, RAG, and \`LLMProvider\`.
- [ ] Workspace automation uses no fake user and keeps \`startedBy\` nullable.
- [ ] Manual M1–M6 execution remains compatible.
- [ ] Schedule API authorization and workspace isolation are tested.
- [ ] Schedule UI uses existing dashboard/shadcn patterns.
- [ ] Audit records are bounded and safe.
- [ ] Scheduler Docker service and heartbeat health are verified.
- [ ] PostgreSQL, Redis, Ollama, app, worker, and scheduler remain healthy.
- [ ] Full typecheck, lint, tests, build, Docker, and local verification pass.
- [ ] No Milestone 8 capability is implemented.
- [ ] No push was performed.
