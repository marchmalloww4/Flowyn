# Milestone 6 Durable Automation and Workflow Engine Design

## Scope

Milestone 6 adds Flowyn's durable workflow execution foundation on top of the existing modular monolith. It adds workspace-scoped workflow definitions, immutable definition versions, immutable run snapshots, a bounded workflow graph, durable workflow and step-run history, a transactional PostgreSQL outbox, BullMQ/Redis delivery, a separately startable worker, conservative retries, execution leases, durable cancellation, a statically registered step-executor registry, controlled built-in steps, protected workflow APIs, a minimal structured workflow UI, audit events, and real PostgreSQL/Redis/BullMQ/Ollama verification.

Milestones 1-5 remain intact. This milestone does not add cron scheduling, scheduled triggers, webhook platforms, Gmail, Slack, LinkedIn, Shopify, social-media integrations, arbitrary HTTP, browser automation, shell commands, arbitrary SQL, arbitrary filesystem access, marketplaces, billing, multi-agent orchestration, production distributed deployment, or a drag-and-drop workflow canvas.

The execution model is at-least-once delivery with guarded, idempotent state transitions. Flowyn must not claim exactly-once execution.

## Existing architecture and reusable components

The implementation reuses:

- lib/database/client.ts and lib/database/schema.ts for Drizzle, transactions, and migrations.
- lib/auth/session.ts for server-session authentication.
- lib/authz/authorization.ts and lib/workspaces/roles.ts for membership and role checks.
- lib/audit/service.ts for sanitized audit metadata and workspace audit events.
- lib/security/errors.ts and lib/http.ts for typed safe errors, JSON validation, and route responses.
- lib/ai/types.ts and the existing LLMProvider contract for provider independence.
- lib/ai/service.ts, especially prepareGeneration and generateText, for controlled AI generation, generation logging, and optional BrandContext/RAG.
- lib/agents/runner.ts and lib/agents/service.ts for controlled AGENT execution. Workflow code does not duplicate agent reasoning, tool validation, or policy enforcement.
- Existing brand and knowledge services for ownership checks and optional retrieval.
- The existing Redis 7 Compose service, append-only persistence, named volume, and REDIS_URL configuration. A reusable queue connection is new; Redis itself is not replaced.

runAgent is already independent of HTTP request handling. Its trusted server-side input, database dependency, provider dependency, and AbortSignal make it suitable for a worker-based workflow executor. A narrow run-linkage hook or equivalent will be added only where needed to associate an AGENT workflow step attempt with its subordinate agent_runs row.

## Domain model

### Workflow definitions and versions

Workflow metadata is mutable only on workflows. Its executable definition is append-only in workflow_versions.

workflows contains id, workspaceId, name, description, enabled, currentVersion, currentVersionId, createdBy, timestamps, and deletedAt.

workflow_versions contains id, workflowId, workspaceId, version, immutable validated definition JSONB, deterministic definition hash, createdBy, createdAt, and unique workflowId/version.

Every definition edit validates the complete candidate definition and transactionally inserts a new version and updates workflows.currentVersion/currentVersionId. Existing workflow_versions.definition values are never mutated. Disabled workflows remain readable but cannot create runs. Deleted workflows are soft-deleted; versions, runs, and step history remain available.

A workflow run stores workflowId, workflowVersion, workflowVersionId, and the exact definitionSnapshot used for execution. Workers never read the mutable current definition after run creation.

### Graph representation

The versioned definition is a small extensible graph:

    {
      "schemaVersion": 1,
      "entryStepId": "step-a",
      "steps": [
        {
          "id": "step-a",
          "type": "SET_VALUE",
          "name": "Set input",
          "config": { "value": "violet" },
          "nextStepId": "step-b"
        }
      ]
    }

Ordinary steps have at most nextStepId. CONDITION steps use onTrueStepId and onFalseStepId. The executor follows one validated path; it is not a general DAG scheduler.

Validation rejects duplicate IDs, missing edge targets, an invalid entry step, unknown types, invalid per-step configuration, unreachable steps, unsafe references, and cycles. Cycles and loops are not supported in Milestone 6.

### Supported steps

The statically registered built-ins are:

- SET_VALUE: emits a bounded JSON-safe literal or explicit reference value.
- TRANSFORM: applies select, lowercase, uppercase, bounded concatenation, or known-field object construction.
- CONDITION: evaluates equals, not_equals, contains, exists, greater_than, or less_than deterministically and selects the true/false edge.
- AI_GENERATE: resolves bounded prompt/system values and calls the existing AI service/provider abstraction.
- AGENT: resolves an authorized agent at execution time and calls the existing AgentRunner.

No step accepts executable JavaScript or invokes dynamic modules, shell, SQL, arbitrary HTTP, filesystem, browser, or external integration behavior.

### Context and references

Workflow context contains bounded trigger input, workflow metadata, and completed step outputs. References use explicit paths such as trigger.customer.name or steps.lookup.output.value. Reference segments reject __proto__, prototype, and constructor. Only valid prior/ancestor outputs can be referenced. The runtime also checks that referenced output exists.

Context size, input size, output size, output count, nesting depth, string lengths, and collection sizes are environment-bounded.

## Durable runs and outputs

workflow_runs contains:

- id, workspaceId, workflowId, workflowVersion, workflowVersionId, and definitionSnapshot.
- status: QUEUED, RUNNING, COMPLETED, FAILED, CANCEL_REQUESTED, CANCELLED, or TIMED_OUT.
- startedBy, bounded input, bounded output, and currentStepId.
- optional idempotencyKey scoped by unique workspaceId/idempotencyKey.
- execution token and lease timestamps.
- cancellation, start, completion, creation, and update timestamps.
- safe errorCode.

workflow_step_runs contains:

- id, workflowRunId, workspaceId, stepId, and stepType.
- attempt and status: RUNNING, SUCCEEDED, FAILED, CANCELLED, or INTERRUPTED.
- bounded schema-controlled safeInput and safeOutput JSONB.
- safe observability fields such as duration and error code.
- nullable subordinate agentRunId for AGENT attempts.
- timestamps and duration.
- unique workflowRunId/stepId/attempt.

Durable workflow output and observability are separate. Durable output is the actual structured, bounded JSON-safe result needed by later steps and crash recovery. Every executor validates and sanitizes it. Observability contains only operational facts such as duration, output size, status, step type, attempt, and error code. Workflow output is not reduced to metadata. Hidden chain-of-thought, raw model observations, unrestricted tool output, credentials, and secrets are never persisted.

## Queue and outbox

BullMQ is the preferred queue and is authorized as the only new runtime dependency because repository inspection confirmed it is not installed. Existing ioredis and Redis Compose configuration are reused.

The API creates a QUEUED run and a workflow_run_dispatches outbox row in one PostgreSQL transaction. The reusable dispatchPendingWorkflowRuns service atomically claims pending dispatches, enqueues deterministic BullMQ jobs, and records dispatch success or safe failure. The worker may invoke or schedule this dispatcher in Milestone 6; a future dedicated dispatcher can reuse it.

Concurrent dispatchers use guarded state/lease transitions. If a process crashes after Redis accepts a job but before the outbox row is marked dispatched, the deterministic BullMQ job ID makes re-enqueue safe enough for at-least-once delivery.

Jobs contain only { runId } and use the ID workflow-run:<runId>. The worker is a separately startable process using the existing application image and codebase. It is not a new microservice.

## Executor registry and run loop

The statically assembled registry exposes:

    interface WorkflowStepExecutor<TConfig> {
      type: WorkflowStepType;
      configSchema: ZodSchema<TConfig>;
      execute(
        context: WorkflowStepExecutionContext,
        config: TConfig
      ): Promise<WorkflowStepResult>;
    }

The execution context contains trusted run/workspace/actor IDs, immutable snapshot data, bounded context, database access, and an abort signal. It does not accept identity or authority from workflow JSON.

The executor:

1. Claims a queued or stale run using an execution token and lease.
2. Checks cancellation, lease ownership, total timeout, and max steps.
3. Creates an immutable step attempt row.
4. Executes the statically registered step with a per-step timeout.
5. Validates and sanitizes durable output.
6. Transactionally records step completion, context/output, and the next step while verifying the active token and lease.
7. Follows the validated edge or completes the run.

If a worker loses its lease, it cannot later write completion over the replacement worker. Recovered execution creates a new attempt and never overwrites historical attempts.

## AGENT and AI_GENERATE

The workflow snapshot stores agentId and brandId as external resource references, not frozen copies of security-sensitive resource configuration.

At execution time an AGENT step resolves the agent server-side, verifies workspace ownership, existence, enabled state, and non-deleted state, resolves a bounded goal, calls runAgent with the persisted actor/database/AbortSignal, and stores bounded structured workflow output plus safe subordinate AgentRun linkage. Disabled or deleted agents fail safely.

AI_GENERATE reuses prepareGeneration, generateText, and LLMProvider. It does not create a second LLM abstraction or import Ollama from workflow domain code. Optional brand context uses existing authorized services. A narrow optional abort signal is passed through AI preparation to the provider.

## State, idempotency, retries, cancellation

Run transitions are guarded:

    QUEUED -> RUNNING
    QUEUED -> CANCEL_REQUESTED -> CANCELLED
    RUNNING -> COMPLETED
    RUNNING -> FAILED
    RUNNING -> TIMED_OUT
    RUNNING -> CANCEL_REQUESTED -> CANCELLED

Terminal statuses cannot restart. Completion cannot overwrite a terminal state. Cancellation updates only cancellable states, so the winning guarded transition is authoritative.

An optional idempotency key is validated and bounded. PostgreSQL enforces unique workspaceId/idempotencyKey. A repeated authorized request returns the existing run only after verifying workspace ownership. Queue/run idempotency remains correct without a client key.

Retry classification is explicit per executor and error. Unknown errors default to non-retryable. AI/Agent timeouts are not automatically retryable. WORKFLOW_MAX_RETRIES is bounded, and every retry creates a new step attempt.

Cancellation authorization is:

- MEMBER may cancel a run they started in their workspace.
- ADMIN/OWNER may cancel any cancellable run in their workspace.
- Cross-workspace cancellation is impossible and non-leaking.

The worker checks cancellation between steps and passes AbortSignal to cancellable AI/Agent operations. Cancellation is durable but not instantaneous.

## Crash and recovery

- Before a step starts: an expired run lease allows the same run to be reclaimed.
- During a step: the stale attempt is closed as INTERRUPTED and a new bounded attempt is created only when the executor classifies recovery as safe.
- After computation but before database transition: computation may repeat; exactly-once is not claimed.
- After database completion but before queue acknowledgement: duplicate delivery observes terminal state and does not restart work.
- After lease loss: token-guarded writes from the old worker fail.

Where practical, AGENT attempts persist their subordinate AgentRun ID. A narrow pre-linkage crash window may leave an M5 run non-terminal; workflow recovery never treats it as completed output, and safe reconciliation may mark stale subordinate runs interrupted/failed without duplicating history.

## Authorization, APIs, and UI

Add workspace actions:

- workflow.read and workflow.run for active members.
- workflow.cancel for members on their own runs and ADMIN/OWNER on any run.
- workflow.write, workflow.delete, and enable/disable for ADMIN/OWNER.

Every workflow, version, run, dispatch, and step query verifies workspace ownership and active membership. Agent and brand references are re-resolved against the workflow workspace. Client identity never becomes authority.

Protected routes:

- GET/POST /api/workflows
- GET/PATCH/DELETE /api/workflows/:id
- POST /api/workflows/:id/runs
- GET /api/workflow-runs/:id
- POST /api/workflow-runs/:id/cancel

Every body uses Zod. The run endpoint authorizes, validates, snapshots, persists, dispatches, and returns an identifier/status; it never executes the workflow inside HTTP.

The minimal UI uses forms or a validated structured editor for metadata, steps, validation, enable/disable, manual runs, safe status/output/error viewing, and cancellation. No visual canvas is included.

## Errors, audit, and environment

Safe workflow error codes include WORKFLOW_NOT_FOUND, WORKFLOW_DISABLED, WORKFLOW_INVALID_DEFINITION, WORKFLOW_INVALID_STEP, WORKFLOW_UNKNOWN_STEP, WORKFLOW_AGENT_NOT_FOUND, WORKFLOW_AGENT_NOT_ALLOWED, WORKFLOW_TIMEOUT, WORKFLOW_STEP_TIMEOUT, WORKFLOW_STEP_FAILED, WORKFLOW_CANCELLED, WORKFLOW_CONTEXT_LIMIT, WORKFLOW_REFERENCE_INVALID, WORKFLOW_ENQUEUE_FAILED, WORKFLOW_LEASE_LOST, and WORKFLOW_IDEMPOTENCY_CONFLICT.

Audit events include workflow.created, workflow.updated, workflow.deleted, workflow.enabled, workflow.disabled, workflow.run_queued, workflow.run_started, workflow.run_completed, workflow.run_failed, workflow.run_cancel_requested, and workflow.run_cancelled. Existing audit sanitization remains the final filter.

Add these bounded settings:

    WORKFLOW_MAX_STEPS=20
    WORKFLOW_TOTAL_TIMEOUT_MS=300000
    WORKFLOW_STEP_TIMEOUT_MS=60000
    WORKFLOW_MAX_RETRIES=2
    WORKFLOW_MAX_INPUT_CHARS=12000
    WORKFLOW_MAX_OUTPUT_CHARS=16000
    WORKFLOW_MAX_CONTEXT_CHARS=24000
    WORKFLOW_DISPATCH_LEASE_MS=30000
    WORKFLOW_EXECUTION_LEASE_MS=90000
    WORKFLOW_WORKER_CONCURRENCY=1

The worker uses existing database, Redis, Ollama, AI, and agent settings. PostgreSQL, Redis, and Ollama services and volumes remain unchanged. Only the application image is reused for the worker command.

## Verification

Unit tests cover definition/version validation, graph connectivity, cycle rejection, unsafe references, bounds, registry behavior, conditions/transforms, retry classification, idempotent transitions, leases, max steps, timeouts, cancellation, and stale-worker protection.

Authorization tests cover workspace isolation, member-owned cancellation, admin/owner cancellation, cross-workspace agent rejection, and historical access after soft deletion.

Real integration tests use PostgreSQL, Redis, BullMQ, and Ollama. They verify existing and clean migrations, outbox recovery, duplicate job handling, immutable snapshots, version transactions, queue consumption, state persistence, retries, leases, cancellation, SET_VALUE, TRANSFORM, CONDITION, AI_GENERATE, AGENT, AgentRun linkage where implemented, and M1-M5 regression behavior.

Required final checks:

    npm run typecheck
    npm run lint
    npm test -- --run
    npm run build
    docker compose config
    docker compose up -d --build
    docker compose ps -a
    .\scripts\verify-local.ps1

The verification script must not reset the existing database or delete Docker volumes. It may create and remove only a clearly named temporary verification database and temporary test records. Milestone 7 is not part of this design.
