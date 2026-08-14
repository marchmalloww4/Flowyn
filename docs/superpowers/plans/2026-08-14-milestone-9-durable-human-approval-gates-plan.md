# Milestone 9 Durable Human Approval Gates Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add a static, durable APPROVAL workflow step that pauses a workflow without holding a worker, allows only an authenticated currently authorized OWNER or ADMIN to decide, and resumes or terminates the same workflow run transactionally.

**Architecture:** Extend the existing workflow type, validation, registry, and executor path with a control result for approval. PostgreSQL owns approval requests, workflow/step waiting state, decision races, expiration, cancellation, and outbox continuation generation. BullMQ remains delivery-only; the scheduler performs bounded expiration maintenance; Better Auth and centralized workspace authorization remain authoritative.

**Tech Stack:** Next.js App Router, TypeScript, Zod, Vitest, Drizzle ORM, PostgreSQL, BullMQ, Redis, Tailwind, existing shadcn/ui-compatible components, Docker Compose.

**Spec:** docs/superpowers/specs/2026-08-14-milestone-9-durable-human-approval-gates-design.md

## Global Constraints

- Implement Milestone 9 only; do not implement Milestone 10.
- Do not add outbound HTTP, OAuth, external integrations, public approval links, email/Slack approvals, file uploads, multi-agent orchestration, visual workflow editing, billing, arbitrary shell/code/SQL/filesystem execution, eval, Function, or dynamic modules.
- PostgreSQL remains authoritative for approval correctness, state, expiration, cancellation, and outbox state.
- Never hold a BullMQ worker or job while waiting for human approval.
- Never restart an approved workflow from step 1 or rerun completed side-effecting steps.
- Approval policy comes from the immutable workflow snapshot, never workflow input or model/tool output.
- Re-check the current authenticated human membership and role at decision time.
- Automation principals may reach approval but can never decide it.
- Use generated and reviewed Drizzle migrations; do not reset PostgreSQL or delete Docker volumes.
- Do not upgrade dependencies unless a specific M9 requirement cannot be met with the current stack.
- Every request body uses a strict Zod schema.
- Preserve all M1-M8 behavior and run the complete required verification before the local M9 commit.

---

### Task 1: Add approval policy and pure workflow-control tests

**Files:**
- Create: tests/workflow-approval.test.ts
- Modify: lib/workflows/types.ts
- Modify: lib/workflows/validation.ts
- Modify: lib/workflows/registry.ts
- Modify: lib/workflows/policy.ts only if shared approval bounds are placed there

**Interfaces:**
- WorkflowStepType gains APPROVAL.
- WorkflowStep gains an APPROVAL variant with requiredRole OWNER or ADMIN, optional expiresAfterSeconds, and optional nextStepId.
- WorkflowStepResult gains a typed control result such as control WAITING_APPROVAL with safe metadata.
- The approval configuration schema enforces integer expiration bounds from 60 through 31,536,000.

- [ ] Write failing validation tests for valid OWNER and ADMIN steps, terminal approvals, next-step approvals, invalid roles, missing roles, invalid expiration, and unknown fields.
- [ ] Run: npm.cmd test -- --run tests/workflow-approval.test.ts. Expected: FAIL because the APPROVAL type and schema do not exist.
- [ ] Implement only the new discriminated-union variant, bounded schema, control result, static approval executor, and registry registration.
- [ ] Assert the approval executor returns WAITING_APPROVAL and has no decision authority.
- [ ] Run: npm.cmd test -- --run tests/workflow-approval.test.ts. Expected: PASS.
- [ ] Commit:

~~~powershell
git add tests/workflow-approval.test.ts lib/workflows/types.ts lib/workflows/validation.ts lib/workflows/registry.ts lib/workflows/policy.ts
git commit -m "feat: add approval workflow step contracts"
~~~

### Task 2: Add approval schema and generated migration

**Files:**
- Create: tests/workflow-approval-schema.test.ts
- Modify: lib/database/schema.ts
- Generate: db/migrations/<generated-m9-approval-migration>.sql
- Generate: db/migrations/meta/<generated-m9-snapshot>.json
- Modify through Drizzle generation: db/migrations/meta/_journal.json

**Interfaces:**
- workflowApprovalRequests table and inferred types.
- WorkflowApprovalStatus.
- Workflow run statuses WAITING_APPROVAL, REJECTED, and EXPIRED.
- Workflow step-run status WAITING_APPROVAL.
- workflowRunDispatches.dispatchGeneration integer defaulting to 0.

- [ ] Write failing schema tests for columns, role/status checks, unique run/step constraint, workspace/run ownership, safe context, expiration, and dispatch generation.
- [ ] Run: npm.cmd test -- --run tests/workflow-approval-schema.test.ts. Expected: FAIL because the table and status types do not exist.
- [ ] Add the approval request table with workspace/run foreign keys, nullable decision actor, status/role checks, indexes for workspace/status/expiration, and the unique run/step barrier.
- [ ] Persist workflowName, workflowStepName, and bounded safeContext for historical projections.
- [ ] Extend workflowRuns and workflowStepRuns status checks and add dispatchGeneration.
- [ ] Run: npm.cmd run db:generate. Review generated SQL and snapshot; do not hand-edit generated metadata.
- [ ] Run: npm.cmd test -- --run tests/workflow-approval-schema.test.ts and npm.cmd run typecheck. Expected: PASS.
- [ ] Commit:

~~~powershell
git add tests/workflow-approval-schema.test.ts lib/database/schema.ts db/migrations
git commit -m "feat: add durable workflow approval schema"
~~~

### Task 3: Add safe approval projections and repository primitives

**Files:**
- Create: lib/approvals/types.ts
- Create: lib/approvals/policy.ts
- Create: lib/approvals/repository.ts
- Create: tests/workflow-approval-repository.test.ts

**Interfaces:**
- ApprovalStatus is PENDING, APPROVED, REJECTED, EXPIRED, or CANCELLED.
- ApprovalSafeProjection contains bounded names, IDs, role, status, timestamps, origin kind, and safe context only.
- getApprovalRequestById(id, db).
- listApprovalRequests(workspaceId, filters, db).
- toSafeApprovalProjection(row).
- normalizeApprovalExpiration(seconds).

- [ ] Write failing projection tests proving raw input, prompts, full webhook payloads, credentials, and unrestricted output are absent.
- [ ] Test bounded names/context and exact expiration bounds.
- [ ] Run: npm.cmd test -- --run tests/workflow-approval-repository.test.ts. Expected: FAIL because the module does not exist.
- [ ] Implement typed Drizzle repository queries and safe projections.
- [ ] Run the focused repository test. Expected: PASS.
- [ ] Commit:

~~~powershell
git add lib/approvals tests/workflow-approval-repository.test.ts
git commit -m "feat: add safe workflow approval projections"
~~~

### Task 4: Implement durable pause and approval-request creation

**Files:**
- Modify: lib/workflows/service.ts
- Modify: lib/workflows/executor.ts
- Modify: lib/workflows/registry.ts
- Create: lib/workflows/executors/approval.ts
- Create: tests/workflow-approval-pause.test.ts

**Interfaces:**
- pauseWorkflowForApproval(input, db) creates or reuses the request, marks the step waiting, marks the run waiting, and clears the lease.
- WorkflowStepControlResult represents WAITING_APPROVAL without a fake output.
- buildSafeApprovalContext(run, step, completedSteps, origin) returns a bounded decision-safe projection.

- [ ] Write failing tests for first pause, duplicate pause retry, historical names, safe-context exclusion, lease clearing, waiting statuses, and one request per run/step.
- [ ] Run: npm.cmd test -- --run tests/workflow-approval-pause.test.ts. Expected: FAIL because pause control and persistence do not exist.
- [ ] Implement an approval executor that validates static configuration and returns WAITING_APPROVAL without inspecting input or calling a decision service.
- [ ] Implement the PostgreSQL pause transaction with execution-token and lease predicates.
- [ ] Integrate the executor control path so the worker returns normally and does not complete the run or hold the job.
- [ ] Run: npm.cmd test -- --run tests/workflow-approval-pause.test.ts tests/workflow-worker.test.ts tests/workflow-executors.test.ts. Expected: PASS.
- [ ] Commit:

~~~powershell
git add lib/workflows tests/workflow-approval-pause.test.ts
git commit -m "feat: pause workflows for durable approvals"
~~~

### Task 5: Add dispatch-generation continuation delivery

**Files:**
- Modify: lib/workflows/queue.ts
- Modify: lib/workflows/outbox.ts
- Modify: lib/workflows/service.ts
- Create: tests/workflow-dispatch-generation.test.ts

**Interfaces:**
- bullmqWorkflowJobId(runId, dispatchGeneration) preserves the existing generation-0 identity and includes generation for continuations.
- enqueueWorkflowRun(runId, dispatchGeneration).
- resumeWorkflowAfterApproval(...) updates run, step, approval, and outbox state transactionally.

- [ ] Write failing tests for generation 0 identity, generation 1 identity, deterministic duplicates, outbox reset to PENDING, and one continuation generation.
- [ ] Run: npm.cmd test -- --run tests/workflow-dispatch-generation.test.ts. Expected: FAIL because generation is not part of queue identity or outbox state.
- [ ] Implement generation-aware queue identity while keeping the BullMQ payload limited to runId.
- [ ] Implement resume transaction: approval step SUCCEEDED, safe output decision approved, currentStepId advances from the immutable snapshot, run becomes QUEUED, lease clears, generation increments, and outbox resets.
- [ ] Run: npm.cmd test -- --run tests/workflow-dispatch-generation.test.ts tests/workflow-outbox.test.ts tests/workflow-service.test.ts. Expected: PASS.
- [ ] Commit:

~~~powershell
git add lib/workflows tests/workflow-dispatch-generation.test.ts
git commit -m "feat: resume approved workflows with dispatch generations"
~~~

### Task 6: Implement transactional approve/reject service

**Files:**
- Create: lib/approvals/service.ts
- Create: tests/workflow-approval-service.test.ts
- Modify: lib/audit/service.ts

**Interfaces:**
- listWorkflowApprovals(userId, workspaceId, filters, db).
- getWorkflowApproval(userId, approvalId, db).
- decideWorkflowApproval(userId, approvalId, decision, db).
- expireWorkflowApproval(approvalId, now, db).
- cancelWorkflowApproval(approvalId, actorUserId, db).

- [ ] Write failing tests for OWNER policy, ADMIN policy, MEMBER denial, role changes, self-approval, repeated decisions, opposite decision conflicts, immutable requiredRole, and audit actors.
- [ ] Run: npm.cmd test -- --run tests/workflow-approval-service.test.ts. Expected: FAIL because the service does not exist.
- [ ] Resolve workspace from the approval row, lock the approval, lock/recheck current membership, and apply the stored role policy.
- [ ] Apply persisted expiration before deciding.
- [ ] Implement conditional PENDING transitions. Same decisions return existing final state; opposite decisions conflict.
- [ ] Record safe creation/approval/rejection/expiration/cancellation audit metadata.
- [ ] Run: npm.cmd test -- --run tests/workflow-approval-service.test.ts tests/audit.test.ts. Expected: PASS.
- [ ] Commit:

~~~powershell
git add lib/approvals lib/audit/service.ts tests/workflow-approval-service.test.ts
git commit -m "feat: add transactional workflow approval decisions"
~~~

### Task 7: Add expiration and cancellation integration

**Files:**
- Modify: lib/approvals/service.ts
- Create: lib/approvals/expiration.ts
- Modify: lib/schedules/scheduler.ts
- Modify: worker/workflow-scheduler.ts
- Modify: lib/workflows/service.ts
- Create: tests/workflow-approval-expiration.test.ts
- Modify: tests/scheduler-runtime.test.ts

**Interfaces:**
- expirePendingWorkflowApprovals(options) performs a bounded PostgreSQL-authoritative sweep.
- The scheduler invokes approval expiration as best-effort maintenance after schedule processing.

- [ ] Write failing tests for no-expiry requests, exact expiry boundary, scheduler delay, lazy expiration, rejection/expiration statuses and error codes, waiting cancellation, and all races.
- [ ] Run: npm.cmd test -- --run tests/workflow-approval-expiration.test.ts tests/scheduler-runtime.test.ts. Expected: FAIL because expiration and waiting cancellation do not exist.
- [ ] Implement lazy and scheduled expiration with persisted expiresAt, bounded batches, conditional transitions, nullable human actor, and safe system reason.
- [ ] Extend cancellation to WAITING_APPROVAL, invalidate pending requests, and avoid continuation dispatch.
- [ ] Run: npm.cmd test -- --run tests/workflow-approval-expiration.test.ts tests/workflow-service.test.ts tests/scheduler-runtime.test.ts. Expected: PASS.
- [ ] Commit:

~~~powershell
git add lib/approvals lib/schedules lib/workflows worker/workflow-scheduler.ts tests/workflow-approval-expiration.test.ts tests/scheduler-runtime.test.ts
git commit -m "feat: expire and cancel waiting approvals"
~~~

### Task 8: Add centralized authorization and protected API routes

**Files:**
- Modify: lib/authz/authorization.ts
- Create: lib/approvals/validation.ts
- Create: app/api/workflow-approvals/route.ts
- Create: app/api/workflow-approvals/[id]/route.ts
- Create: app/api/workflow-approvals/[id]/approve/route.ts
- Create: app/api/workflow-approvals/[id]/reject/route.ts
- Create: tests/workflow-approval-routes.test.ts
- Modify: tests/authorization.test.ts

**Interfaces:**
- Strict list query schema with workspace UUID and bounded status/limit filters.
- Strict empty decision body schema.
- Route handlers authenticate, validate, call services, and return safe JSON.

- [ ] Write failing tests for unauthenticated access, member read access, member denial, OWNER/ADMIN policy enforcement, cross-workspace 404 behavior, strict bodies, duplicate decisions, and safe response fields.
- [ ] Run: npm.cmd test -- --run tests/workflow-approval-routes.test.ts tests/authorization.test.ts. Expected: FAIL because actions, schemas, and routes do not exist.
- [ ] Add only workflow_approval.read and workflow_approval.decide. Keep required-role enforcement in the transaction service.
- [ ] Implement thin route handlers with requireUser, strict Zod parsing, service calls, and errorResponse.
- [ ] Run the focused route and authorization tests. Expected: PASS.
- [ ] Commit:

~~~powershell
git add lib/authz lib/approvals app/api/workflow-approvals tests/workflow-approval-routes.test.ts tests/authorization.test.ts
git commit -m "feat: add protected workflow approval APIs"
~~~

### Task 9: Add minimal approval inbox UI

**Files:**
- Create: components/forms/approval-panel.tsx
- Create: lib/approvals/ui.ts
- Create: tests/workflow-approval-panel.test.ts
- Modify: app/(dashboard)/dashboard/page.tsx

**Interfaces:**
- formatApprovalStatus(status) returns safe display labels.
- canDecideApproval(role, requiredRole) mirrors server display policy only; server authorization remains authoritative.

- [ ] Write failing tests for pending/history rendering, safe context, member read-only state, OWNER/ADMIN controls, and secret/prompt/payload exclusion.
- [ ] Run: npm.cmd test -- --run tests/workflow-approval-panel.test.ts. Expected: FAIL because the panel does not exist.
- [ ] Implement the focused panel using existing dashboard workspace selection, Tailwind, and UI primitives.
- [ ] Run the focused UI test and npm.cmd run build. Expected: PASS.
- [ ] Commit:

~~~powershell
git add components/forms/approval-panel.tsx lib/approvals/ui.ts tests/workflow-approval-panel.test.ts app/(dashboard)/dashboard/page.tsx
git commit -m "feat: add workflow approval inbox"
~~~

### Task 10: Add end-to-end manual, scheduled, webhook, and concurrency integration tests

**Files:**
- Create: tests/workflow-approval.integration.test.ts
- Modify: scripts/verify-local.ps1
- Modify: SETUP.md
- Modify: README.md
- Modify: ARCHITECTURE.md
- Modify: SECURITY.md
- Modify: AI.md

**Interfaces:**
- Guard integration tests with RUN_APPROVAL_INTEGRATION=1.
- Use isolated UUID users/workspaces and cascade cleanup, following existing workflow, scheduling, and webhook integration conventions.

- [ ] Write failing integration tests for manual/scheduled/webhook approval and resume, rejection, expiration, waiting cancellation, role policy, role change, self-approval, races, duplicates, retry uniqueness, continuation generation, and completed-step non-rerun.
- [ ] Run: $env:RUN_APPROVAL_INTEGRATION='1'; npm.cmd test -- --run tests/workflow-approval.integration.test.ts. Expected: FAIL until runtime behavior exists.
- [ ] Start an isolated BullMQ worker, create manual/schedule/webhook runs through existing services, drive authenticated decision services, dispatch the existing outbox, and wait for terminal results.
- [ ] Add negative cases proving AI/agents/automation cannot decide and cross-workspace access does not reveal request existence.
- [ ] Run the guarded integration test. Expected: PASS.
- [ ] Update documentation and scripts/verify-local.ps1 with approval schema checks and guarded integration without changing M1-M8 checks.
- [ ] Commit:

~~~powershell
git add tests/workflow-approval.integration.test.ts scripts/verify-local.ps1 SETUP.md README.md ARCHITECTURE.md SECURITY.md AI.md
git commit -m "test: verify durable workflow approvals"
~~~

### Task 11: Run required migration, runtime, and full regression verification

**Files:**
- No planned source changes; fix only M9-related failures discovered by verification.

- [ ] Apply to existing development PostgreSQL: docker compose exec -T app npm run db:migrate. Expected: exit code 0 and existing data preserved.
- [ ] Apply to a clean temporary PostgreSQL database, verify all M1–M9 schema checks, then drop only that temporary database. Never reset flowyn or any Docker volume.
- [ ] Run static verification:

~~~powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- --run
npm.cmd run build
~~~

Expected: all commands exit 0.

- [ ] Run Compose verification:

~~~powershell
docker compose config
docker compose up -d --build
docker compose ps
~~~

Expected: app, worker, scheduler, PostgreSQL, Redis, and Ollama remain running/healthy.
- [ ] Run all available guarded integrations for durable workflows, scheduling, webhooks, approvals, Ollama, embeddings/pgvector/RAG, and agents.
- [ ] Run: .\scripts\verify-local.ps1. Expected: exit code 0 and an M9 success message with approval schema and integration checks.
- [ ] Perform final security review for public approval routes, untrusted role/workspace decisions, AI/agent approval calls, raw context exposure, missing workspace predicates, arbitrary execution additions, and M10 terms in production code. Review generated migration SQL.

### Task 12: Commit the final M9 implementation locally

**Files:**
- All verified M9 implementation files and generated migration files.

- [ ] Run git diff --check, git status --short --branch, and git diff --stat HEAD~1. Expected: only M9 changes exist.
- [ ] Stage all M9 changes and commit:

~~~powershell
git add --all
git commit -m "feat: add durable human approval gates"
~~~

- [ ] Verify the final commit without pushing:

~~~powershell
git status --short --branch
git log -3 --oneline --decorate
git show --stat --oneline HEAD
~~~

Expected: clean local tree, M9 implementation commit present, no push.

## Plan self-review

- Spec coverage: workflow step, immutable policy, pause, resume, rejection, expiration, cancellation, role checks, self-approval, safe context, automation origins, API, UI, audit, migrations, Docker, tests, and M10 exclusions each have tasks.
- Placeholder scan: tasks name concrete files, interfaces, commands, expected outcomes, and commit boundaries.
- Type consistency: approval request/repository/service names, dispatch generation, workflow control result, statuses, and integration flag are consistent across tasks.
- Regression protection: every implementation task has focused tests and the final verification matrix covers M1-M8.
