# Milestone 9 — Durable Human Approval Gates Design

## Status

Approved for implementation planning and implementation by the project owner. This document defines Milestone 9 only. Milestones 1–8 remain unchanged, and Milestone 10 is explicitly excluded.

## Objective

Add an explicit static `APPROVAL` workflow step. When execution reaches the step, Flowyn durably pauses the existing workflow run, releases the worker lease, and creates one workspace-scoped approval request. An authenticated and currently authorized human may approve or reject the request through protected Flowyn APIs. Approval resumes the same immutable workflow run through the existing PostgreSQL outbox and BullMQ worker; rejection or expiration terminates the run.

The feature adds no public approval endpoint, external approval link, email approval, OAuth, outbound HTTP, external integration, file upload, browser automation, or arbitrary execution capability.

## Product model

Approval is step-based, not run-level. A workflow definition may contain:

```json
{
  "id": "approval",
  "type": "APPROVAL",
  "name": "Manager approval",
  "config": {
    "requiredRole": "ADMIN",
    "expiresAfterSeconds": 86400
  },
  "nextStepId": "next-step"
}
```

`requiredRole` is `OWNER` or `ADMIN`. `expiresAfterSeconds` is optional and bounded from 60 seconds through 31,536,000 seconds. An approval step may be terminal by omitting `nextStepId`.

M9 does not implement individual assignment, groups, quorum, delegation, reassignment, maker-checker separation, or external approval links.

## Existing architecture reused

- Better Auth and `requireUser` remain the authentication system.
- `requireWorkspaceMember` and `requireWorkspaceAction` remain authoritative for workspace authorization.
- `AppError`, `errorResponse`, and existing safe response projections remain the error boundary.
- PostgreSQL/Drizzle remains durable state and concurrency authority.
- The existing workflow definition validator, immutable versions, run snapshots, executor, static step registry, step history, and worker are reused.
- The existing transactional outbox and BullMQ queue remain the only asynchronous workflow delivery path.
- The scheduler remains PostgreSQL-authoritative and receives bounded approval-expiration maintenance.
- `WORKSPACE_AUTOMATION` remains an internal non-forgeable principal for schedules and webhooks.
- `LLMProvider`, `BrandContext`/RAG, `AgentRunner`, and the safe static tool registry are unchanged.
- Existing audit logging and sanitized metadata are reused.
- Docker Compose services, named volumes, PostgreSQL data, Redis data, and Ollama data are preserved.

No second workflow engine, queue, authentication system, authorization layer, or generic HTTP subsystem is introduced.

## Workflow step and state model

Extend `WorkflowStepType` and the static registry with `APPROVAL`.

The approval executor validates its configuration and returns an explicit control result. The orchestration layer, not model output or the executor itself, performs the durable pause transaction.

Workflow run statuses become:

- Existing statuses: `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCEL_REQUESTED`, `CANCELLED`, `TIMED_OUT`.
- New statuses: `WAITING_APPROVAL`, `REJECTED`, `EXPIRED`.

Workflow step-run statuses become:

- Existing statuses: `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `INTERRUPTED`.
- New status: `WAITING_APPROVAL`.

When rejected or expired, the approval step run uses `FAILED` with one of these safe error codes:

- `WORKFLOW_APPROVAL_REJECTED`
- `WORKFLOW_APPROVAL_EXPIRED`

When cancelled, it uses the existing `CANCELLED` step status.

Successful approval produces the bounded output:

```json
{ "decision": "approved" }
```

The output contains no approver identity, credentials, prompts, or workflow input.

## Approval state machine

Approval requests use these states:

```text
PENDING -> APPROVED
PENDING -> REJECTED
PENDING -> EXPIRED
PENDING -> CANCELLED
```

Only a `PENDING` row can transition. PostgreSQL conditional updates and row locks determine the winner of concurrent operations.

Run behavior:

```text
QUEUED/RUNNING -> WAITING_APPROVAL
WAITING_APPROVAL -> QUEUED       on approval
WAITING_APPROVAL -> REJECTED     on rejection
WAITING_APPROVAL -> EXPIRED      on expiry
WAITING_APPROVAL -> CANCELLED    on cancellation
```

## Durable pause behavior

When the worker reaches an approval step:

1. It validates the step from the immutable run snapshot.
2. It creates the step attempt.
3. It creates or finds the unique approval request.
4. It marks the step run `WAITING_APPROVAL`.
5. It changes the run to `WAITING_APPROVAL`.
6. It clears `executionToken` and `leaseExpiresAt` on the run.
7. It commits the transaction.
8. It returns normally from the worker.

The BullMQ job is not held open, and the worker does not poll or sleep while waiting.

If a worker crashes before the transaction commits, normal lease recovery retries the run. If it crashes after commit, the run is already `WAITING_APPROVAL`; retry delivery is a no-op and cannot create a second request.

## Approval data model

Add a generated Drizzle migration for `workflow_approval_requests` with:

- `id` UUID primary key.
- `workspaceId` required workspace foreign key.
- `workflowRunId` required workflow-run foreign key.
- `workflowStepId` immutable snapshot step identifier.
- `workflowName` bounded historical display name.
- `workflowStepName` bounded historical step display name.
- `requiredRole` constrained to `OWNER` or `ADMIN`.
- `status` constrained to `PENDING`, `APPROVED`, `REJECTED`, `EXPIRED`, or `CANCELLED`.
- `safeContext` bounded JSON projection containing only decision-safe metadata.
- `createdAt`.
- Nullable `expiresAt`.
- Nullable `decidedAt`.
- Nullable `decidedBy` foreign key with safe deletion behavior.
- Nullable safe decision reason/metadata where needed.

Constraints and indexes:

- Unique `(workflowRunId, workflowStepId)` prevents duplicate requests.
- Workspace/run foreign-key consistency is enforced through composite constraints where supported and repeated service checks.
- `workflowStepId` is verified against the immutable `definitionSnapshot`; it is not trusted as an executable resource ID.
- Status, required-role, and expiration constraints are database-enforced.
- Workspace/status/expiration indexes support inbox and bounded expiration scans.

Extend `workflowRuns` and `workflowStepRuns` status checks. Add an integer `dispatchGeneration` to `workflowRunDispatches`, defaulting to `0`.

## Safe approval context

Approval projections show only information necessary for a human decision:

- Historical workflow name.
- Historical approval step name.
- Run ID and workflow version.
- Required role.
- Request and expiration timestamps.
- Origin kind: manual, schedule, or webhook.
- Bounded operational summaries from previously completed steps.

The stored context must not include raw workflow input, full webhook payloads, raw prompts, hidden reasoning, unrestricted model observations, unrestricted tool output, credentials, or secrets. Context is bounded at creation and never reconstructed by exposing the full run or step history.

## Transaction boundaries

### Pause transaction

The pause service locks the current run/step scope, verifies the execution token and lease, verifies the immutable approval step, inserts the unique request, marks the step waiting, marks the run waiting, clears the lease, and commits as one PostgreSQL transaction.

### Approve/reject transaction

The decision service:

1. Resolves the request and owning workspace server-side.
2. Locks the approval row.
3. Locks and re-checks the current workspace membership.
4. Applies the required-role policy using the stored immutable role.
5. Applies persisted expiration before deciding.
6. Transitions `PENDING` to the requested terminal decision.
7. Updates the step run and workflow run.
8. For approval, advances `currentStepId` and resets the existing outbox row to `PENDING`.
9. Commits before returning.

### Expiration transaction

Expiration uses the same conditional transition as decisions. The scheduler performs bounded expiration batches, while decision/read paths may lazily finalize an overdue pending request so scheduler delay cannot allow a late decision.

## Dispatch-generation continuation

The existing outbox row remains one row per workflow run. Initial dispatch uses generation `0`, preserving existing behavior. On approval:

- `dispatchGeneration` increments.
- Outbox status becomes `PENDING`.
- Dispatch attempts and leases are reset.
- The outbox dispatcher creates a deterministic continuation job identity containing both run ID and generation.

The job payload remains bounded to the run ID. Generation prevents a retained completed BullMQ job from suppressing a legitimate continuation job. Duplicate continuation deliveries remain safe because workflow-run claiming and state transitions are conditional.

## Authorization and self-approval

Add centralized actions:

- `workflow_approval.read` — active workspace members.
- `workflow_approval.decide` — OWNER and ADMIN at the coarse authorization layer; the service applies the stored required role.

Decision policy:

- `OWNER` approval: only the user’s current workspace role `OWNER`.
- `ADMIN` approval: current `OWNER` or `ADMIN`.
- `MEMBER` never approves.

Authorization is evaluated at decision time. Membership or role changes while a request is pending immediately affect eligibility.

Self-approval is allowed when the workflow creator/starter’s current role satisfies the approval policy. M9 does not add maker-checker separation.

## Expiration

`expiresAfterSeconds` is copied from the immutable snapshot and converted to persisted `expiresAt` when the request is created.

- Minimum: 60 seconds.
- Maximum: 31,536,000 seconds.
- Absent value: waits indefinitely until decision or cancellation.
- Expired requests cannot be approved or rejected.
- Expiry creates `EXPIRED` workflow status and `WORKFLOW_APPROVAL_EXPIRED` step error.
- Scheduler expiration is bounded and best effort; database state remains authoritative.

## Cancellation semantics

Existing workflow cancellation is extended to `WAITING_APPROVAL`.

Cancellation atomically:

- transitions the pending request to `CANCELLED`;
- marks the approval step run `CANCELLED`;
- transitions the run to `CANCELLED`;
- prevents continuation dispatch.

Race rules:

- Approve versus cancel: first committed transaction wins.
- Reject versus cancel: first committed transaction wins.
- Expiry versus approve/reject: first committed transaction wins.
- A losing operation returns the already-final state and cannot overwrite it.
- If approval wins first, normal cancellation may still cancel the newly queued continuation.

## API design

Protected routes:

- `GET /api/workflow-approvals?workspaceId=...`
- `GET /api/workflow-approvals/:id`
- `POST /api/workflow-approvals/:id/approve`
- `POST /api/workflow-approvals/:id/reject`

Every handler authenticates with `requireUser`, validates query/body input with Zod, resolves workspace ownership server-side, calls the approval service, and returns typed safe JSON. There are no public decision routes.

Repeated identical decisions are idempotent. Opposite decisions return a safe conflict. Cross-workspace requests use non-leaking 404 behavior consistent with existing resources.

## UI design

Add a minimal dashboard approval inbox/panel using existing workspace selection, Tailwind, and shadcn/ui-compatible primitives.

It displays pending and historical approvals with workflow name, run, step, role, timestamps, bounded safe context, and approve/reject controls. It never displays secrets, credentials, raw prompts, chain-of-thought, unrestricted observations, or full webhook payloads.

Existing JSON workflow editing may define `APPROVAL` steps. No visual editor is added.

## Audit strategy

Reuse the existing audit service with:

- `workflow_approval.created`
- `workflow_approval.approved`
- `workflow_approval.rejected`
- `workflow_approval.expired`
- `workflow_approval.cancelled`

Decision events record the authenticated human actor. Automation-originated creation and scheduler expiration use nullable human actors and safe origin/system metadata. Audit metadata never contains raw workflow input, prompts, credentials, secrets, model reasoning, or unrestricted tool output.

## Security boundaries

Approval is a human authorization boundary. Approval authority never comes from AI, AgentRunner, scheduler automation, webhook callers, workflow input, RAG content, tool output, or client-provided roles/workspaces.

The policy is taken from the immutable workflow snapshot and copied into the approval request. Only Better Auth-authenticated users can decide, and current membership/role is checked inside the decision transaction.

M9 introduces no external HTTP, OAuth, external credentials, callbacks, public approval tokens, browser automation, file upload, shell, SQL, filesystem, code execution, or dynamic modules.

## Failure and recovery

- Crash before pause commit: lease recovery retries the current workflow step.
- Crash after pause commit: the run remains waiting and duplicate delivery is harmless.
- Application restart: PostgreSQL state remains authoritative.
- Redis outage: approval correctness is unaffected; outbox delivery may be delayed.
- Outbox outage: approved run remains queued with a retryable outbox row.
- Scheduler outage: lazy expiration remains available; cleanup is delayed only.
- Membership changes: current role is evaluated at decision time.
- Workflow edits: pending runs use their immutable snapshots.
- Workflow soft deletion: existing runs remain governed by their snapshots; deletion blocks new runs.
- Duplicate continuation: generation plus conditional run claiming prevents duplicate logical execution.

## Migration strategy

Modify the Drizzle schema, generate and review the next migration, then run it against the existing development database and a clean temporary database. Do not reset PostgreSQL or delete Docker volumes. Existing workflow rows, schedule rows, webhook rows, and run history must remain valid.

New workers and app routes must be deployed together with the migration because older workers do not understand `APPROVAL` or the new run statuses.

## Docker/runtime implications

No new service, queue, Redis instance, database, Ollama instance, volume, dependency, or network boundary is required. The scheduler receives bounded approval expiration maintenance alongside existing webhook cleanup. Existing health checks and service commands remain authoritative.

## Testing strategy

Test-first coverage must include:

- approval configuration and expiration bounds;
- static registry and workflow graph support;
- immutable snapshot policy;
- one request per run/step;
- pause without holding BullMQ;
- worker crash before and after pause commit;
- approve, reject, and expiration transitions;
- resume from the next step without rerunning completed steps;
- duplicate approval submission;
- concurrent approve/reject and approval/cancellation/expiration races;
- outbox failure and duplicate continuation delivery;
- OWNER-only and OWNER/ADMIN policies;
- MEMBER denial;
- role change while pending;
- authorized self-approval;
- manual, scheduled, and webhook-originated runs;
- AI, agents, scheduler, webhook, input, RAG, and tool-output non-authority;
- cross-workspace non-leaking behavior;
- safe projections and audit metadata;
- full M1–M8 regression tests;
- typecheck, lint, build, Docker, health, migrations, and live integration verification.

## Explicit Milestone 10 exclusions

- Outbound integrations.
- OAuth.
- Gmail, Slack, Shopify, LinkedIn, or other third-party APIs.
- Arbitrary HTTP or user-provided URLs.
- Public approval links, email approvals, or Slack approvals.
- File uploads.
- Multi-agent orchestration.
- Billing.
- Marketplace features.
- Visual workflow canvas.
- Quorum, assignment, delegation, or reassignment.
- Browser automation.
- Arbitrary shell, code, SQL, filesystem, `eval`, `Function`, or dynamic modules.

## Ordered implementation tasks

1. Add failing pure tests for approval config, bounded expiration, state transitions, and safe output.
2. Extend workflow types, validation, graph support, registry, and executor control results.
3. Add failing schema/repository tests and generate the approval/dispatch migration.
4. Implement durable pause/request creation with crash-safe uniqueness.
5. Implement dispatch-generation continuation identities.
6. Implement transactional approve/reject services with decision-time authorization.
7. Implement lazy and scheduler-driven expiration.
8. Extend cancellation to invalidate waiting approvals.
9. Add centralized authorization and safe workspace-scoped projections.
10. Add protected approval API routes.
11. Add audit events.
12. Add the minimal approval inbox UI.
13. Add concurrency, crash/recovery, security, and manual/scheduled/webhook integration tests.
14. Update documentation and local verification.
15. Run the complete verification matrix and perform a final security review.
16. Commit Milestone 9 locally without pushing.

## Implementation decisions resolved

- Expiration bounds are 60 to 31,536,000 seconds.
- Successful approval output is `{ "decision": "approved" }`.
- Workflow statuses are `WAITING_APPROVAL`, `REJECTED`, and `EXPIRED`.
- Step statuses remain compact with `WAITING_APPROVAL`, `SUCCEEDED`, `FAILED`, and `CANCELLED` behavior.
- Historical workflow and step names are copied into the approval request.
- Approval context is a bounded safe projection and excludes raw inputs and full webhook payloads.
- Dispatch generation starts at zero and increments for approval continuation.
- Human audit actor is nullable for automation-originated creation and scheduler expiration.

M9 does not begin until this document and its implementation plan are committed.
