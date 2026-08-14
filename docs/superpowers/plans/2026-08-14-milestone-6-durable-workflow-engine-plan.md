# Milestone 6 Durable Workflow Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build Flowyn's workspace-safe durable workflow foundation with immutable versions/snapshots, BullMQ delivery, a reusable transactional outbox dispatcher, a separately startable worker, bounded built-in steps, retries, leases, cancellation, and real integration verification.

**Architecture:** Keep Flowyn as a modular monolith with a separate worker process using the same application image and domain modules. Store immutable workflow definitions as validated JSON graph versions, copy the selected version into each run, persist structured bounded outputs separately from observability metadata, and use PostgreSQL guarded transitions as the execution authority. Use BullMQ with the existing Redis service and a reusable outbox dispatcher for at-least-once delivery; never claim exactly-once execution.

**Tech Stack:** Next.js App Router, strict TypeScript, Drizzle ORM, PostgreSQL 16 with pgvector, Redis 7, BullMQ, existing ioredis, Better Auth, existing LLMProvider/OllamaProvider, Zod, Vitest, Tailwind, and existing shadcn-compatible components.

**Spec:** docs/superpowers/specs/2026-08-14-milestone-6-durable-automation-workflow-engine-design.md

## Global Constraints

- Implement Milestone 6 only; do not implement Milestone 7 scheduling, webhooks, integrations, billing, visual canvas, marketplace, multi-agent orchestration, or production distributed deployment.
- Preserve all M1-M5 behavior, migrations, data, Docker volumes, RAG behavior, AgentRunner security, and existing provider abstractions.
- BullMQ is the only authorized new runtime dependency; do not upgrade unrelated dependencies.
- Keep the transactional PostgreSQL outbox and implement dispatchPendingWorkflowRuns as a reusable service/function independent of worker bootstrap.
- Use at-least-once delivery with PostgreSQL guarded state transitions, execution tokens, leases, stale recovery, and bounded attempts; never claim exactly-once execution.
- Workflow versions are append-only; workflow definition edits validate, insert a new immutable version, and update current-version metadata in one transaction.
- Durable workflow output is structured, bounded, JSON-safe, schema-controlled, and separate from safe observability/audit metadata.
- Retryability is explicit per executor/error classification; unknown failures and unsafe AI/Agent timeouts default to non-retryable.
- MEMBER may cancel only runs they started; ADMIN/OWNER may cancel any cancellable run in their workspace.
- AGENT steps re-resolve current workspace-owned agent definitions at execution time and never use frozen security-sensitive agent copies.
- No eval, Function, dynamic executable JavaScript, dynamic user-selected modules, shell, arbitrary SQL, arbitrary filesystem, arbitrary HTTP, browser automation, or external integrations.
- Reject reference segments __proto__, prototype, and constructor.
- Add Zod validation for every request body and strict schemas for all workflow definitions, step configs, references, inputs, outputs, and idempotency keys.
- Never persist chain-of-thought, raw model observations, unrestricted tool output, credentials, or secrets.
- Use apply_patch for source and documentation edits. Use Drizzle generation for migration files and review generated SQL.
- Do not reset databases, delete Docker volumes, push, or commit implementation until all required verification gates pass.

## File map

Create the focused workflow modules:

- lib/workflows/types.ts: workflow statuses, graph types, executor types, run/step DTOs.
- lib/workflows/policy.ts: environment-backed workflow limits and validation.
- lib/workflows/validation.ts: request, graph, reference, and per-step Zod schemas.
- lib/workflows/graph.ts: reachability, ancestor/reference, and cycle validation.
- lib/workflows/context.ts: bounded context construction, safe value resolution, sanitization, and prototype-pollution protection.
- lib/workflows/errors.ts: typed workflow error helpers and retry classification.
- lib/workflows/service.ts: authorized CRUD, version transactions, run creation, history, cancellation, and guarded transitions.
- lib/workflows/queue.ts: BullMQ queue name, deterministic job IDs, and enqueue contract.
- lib/workflows/outbox.ts: reusable guarded transactional-outbox dispatcher.
- lib/workflows/registry.ts: statically assembled step registry.
- lib/workflows/executor.ts: lease-aware workflow loop and step-attempt persistence.
- lib/workflows/executors/set-value.ts: SET_VALUE executor.
- lib/workflows/executors/transform.ts: safe TRANSFORM executor.
- lib/workflows/executors/condition.ts: deterministic CONDITION executor.
- lib/workflows/executors/ai-generate.ts: LLMProvider-backed AI_GENERATE executor.
- lib/workflows/executors/agent.ts: existing AgentRunner-backed AGENT executor.
- lib/workflows/worker.ts: worker lifecycle, heartbeat, recovery, and BullMQ handler.
- worker/workflow-worker.ts: independently startable worker entrypoint.
- scripts/check-worker-health.ts: Redis heartbeat health probe.

Modify these existing files:

- package.json and package-lock.json for BullMQ and worker scripts.
- lib/env.ts, .env.example, and docker-compose.yml for workflow/worker settings.
- lib/ai/service.ts to carry an optional AbortSignal through prepared generation.
- lib/agents/runner.ts only for a narrow subordinate-run linkage hook if required.
- lib/authz/authorization.ts and lib/audit/service.ts for workflow actions/events.
- lib/database/schema.ts and generated db/migrations files.
- app/api/workflows routes and dashboard components.
- README.md, ARCHITECTURE.md, SECURITY.md, AI.md, SETUP.md, and scripts/verify-local.ps1.

Create tests with focused responsibility:

- tests/workflow-policy.test.ts
- tests/workflow-validation.test.ts
- tests/workflow-graph.test.ts
- tests/workflow-context.test.ts
- tests/workflow-schema.test.ts
- tests/workflow-service.test.ts
- tests/workflow-authorization.test.ts
- tests/workflow-outbox.test.ts
- tests/workflow-registry.test.ts
- tests/workflow-executors.test.ts
- tests/workflow-runner.test.ts
- tests/workflow-routes.test.ts
- tests/workflow-worker.test.ts
- tests/workflow.integration.test.ts
- tests/workflow-ollama.integration.test.ts

---

### Task 1: Add BullMQ dependency, workflow policy, and AI cancellation plumbing

**Files:**

- Modify: package.json
- Modify: package-lock.json through npm install
- Modify: lib/env.ts
- Modify: .env.example
- Modify: lib/ai/service.ts
- Create: lib/workflows/policy.ts
- Test: tests/workflow-policy.test.ts
- Test: tests/ai-generation-service.test.ts

**Interfaces:**

    export interface WorkflowExecutionPolicy {
      maxSteps: number;
      totalTimeoutMs: number;
      stepTimeoutMs: number;
      maxRetries: number;
      maxInputChars: number;
      maxOutputChars: number;
      maxContextChars: number;
      dispatchLeaseMs: number;
      executionLeaseMs: number;
      workerConcurrency: number;
    }

    export function getWorkflowExecutionPolicy(): WorkflowExecutionPolicy;

    export interface GenerationRequest {
      userId: string;
      workspaceId: string;
      brandId?: string;
      prompt: string;
      system?: string;
      temperature?: number;
      maxTokens?: number;
      useBrandContext?: boolean;
      abortSignal?: AbortSignal;
    }

**Steps:**

- [ ] Write failing policy tests for defaults, hard bounds, invalid worker concurrency, and invalid timeout/retry combinations.
- [ ] Write a failing AI service test proving an AbortSignal reaches the provider input returned by prepareGeneration.
- [ ] Run npm test -- --run tests/workflow-policy.test.ts tests/ai-generation-service.test.ts and confirm failure.
- [ ] Run npm install bullmq and verify package.json contains only the authorized BullMQ addition plus the worker entry script; inspect package-lock changes for unrelated dependency upgrades.
- [ ] Add the ten WORKFLOW settings with defaults 20, 300000, 60000, 2, 12000, 16000, 24000, 30000, 90000, and 1. Enforce practical hard ceilings in lib/workflows/policy.ts.
- [ ] Add abortSignal to GenerationRequest and pass it as signal in PreparedGeneration.providerInput. Do not create a second provider interface.
- [ ] Run the focused tests and npm run typecheck.

### Task 2: Implement workflow graph schemas, references, and bounded context

**Files:**

- Create: lib/workflows/types.ts
- Create: lib/workflows/validation.ts
- Create: lib/workflows/graph.ts
- Create: lib/workflows/context.ts
- Create: lib/workflows/errors.ts
- Test: tests/workflow-validation.test.ts
- Test: tests/workflow-graph.test.ts
- Test: tests/workflow-context.test.ts

**Interfaces:**

    export const workflowDefinitionSchema: z.ZodType<WorkflowDefinition>;
    export function validateWorkflowDefinition(input: unknown): WorkflowDefinition;
    export function validateWorkflowGraph(definition: WorkflowDefinition): void;

    export type WorkflowStepType =
      | "SET_VALUE"
      | "TRANSFORM"
      | "CONDITION"
      | "AI_GENERATE"
      | "AGENT";

    export type WorkflowValueExpression =
      | { kind: "literal"; value: JsonValue }
      | { kind: "reference"; path: string };

    export interface WorkflowDefinition {
      schemaVersion: 1;
      entryStepId: string;
      steps: WorkflowStep[];
    }

    export interface WorkflowStepExecutionContext {
      runId: string;
      workspaceId: string;
      actorUserId: string;
      workflowId: string;
      workflowVersion: number;
      triggerInput: JsonValue;
      stepOutputs: Record<string, JsonValue>;
      abortSignal: AbortSignal;
      db: Database;
    }

    export interface WorkflowStepResult {
      output: JsonValue;
      nextStepId: string | null;
      retryable?: boolean;
      safeMetadata: Record<string, string | number | boolean | null>;
      agentRunId?: string;
    }

**Steps:**

- [ ] Write failing schema tests for all five step types, strict unknown-key rejection, bounded literals, valid references, and malformed configurations.
- [ ] Write failing graph tests for duplicate IDs, missing targets, invalid entry, unreachable steps, supported branching, and cycle rejection.
- [ ] Write failing context tests for trigger and step references, missing values, context/output bounds, unsafe segments, excessive depth, and prototype pollution.
- [ ] Run the focused tests and confirm failure.
- [ ] Define JSON-safe values without undefined, functions, symbols, dates, or class instances. Enforce bounded strings, arrays, objects, and nesting.
- [ ] Define strict per-step configs: SET_VALUE, TRANSFORM, CONDITION, AI_GENERATE, and AGENT. Use explicit value expressions rather than templates or executable expressions.
- [ ] Define TRANSFORM operations for select, lowercase, uppercase, concat, and object construction only.
- [ ] Implement graph edge validation and DFS cycle/reachability checks. Compute ancestor sets so references to the current or non-ancestor step are rejected.
- [ ] Implement reference parsing and resolution with explicit trigger and steps paths. Reject __proto__, prototype, constructor, empty segments, and unknown roots.
- [ ] Implement context sanitization and size accounting. Return typed WORKFLOW_CONTEXT_LIMIT and WORKFLOW_REFERENCE_INVALID errors.
- [ ] Run focused tests, npm run typecheck, and npm run lint.

### Task 3: Add workflow persistence schema and generated migration

**Files:**

- Modify: lib/database/schema.ts
- Create through Drizzle: db/migrations/0005_*.sql
- Create through Drizzle: db/migrations/meta/0005_snapshot.json
- Modify through Drizzle: db/migrations/meta/_journal.json
- Test: tests/workflow-schema.test.ts

**Interfaces:**

    export type WorkflowStatus =
      | "QUEUED"
      | "RUNNING"
      | "COMPLETED"
      | "FAILED"
      | "CANCEL_REQUESTED"
      | "CANCELLED"
      | "TIMED_OUT";

    export type WorkflowStepRunStatus =
      | "RUNNING"
      | "SUCCEEDED"
      | "FAILED"
      | "CANCELLED"
      | "INTERRUPTED";

    export type WorkflowDispatchStatus =
      | "PENDING"
      | "CLAIMED"
      | "DISPATCHED"
      | "FAILED";

    export const workflows: PgTable;
    export const workflowVersions: PgTable;
    export const workflowRuns: PgTable;
    export const workflowStepRuns: PgTable;
    export const workflowRunDispatches: PgTable;

**Steps:**

- [ ] Write failing schema contract tests requiring all five tables, workspace foreign keys, status/type checks, version uniqueness, run snapshots, step attempt uniqueness, idempotency uniqueness, lease fields, dispatch fields, and nullable agentRunId linkage.
- [ ] Run the schema test and confirm failure.
- [ ] Add Drizzle tables with UUID keys, bounded text columns, JSONB fields, timestamps, indexes for workspace/status/run lookup, and foreign keys preserving historical runs and step history.
- [ ] Add immutable workflow version fields and a unique workflow/version index. Keep current version metadata transactionally consistent through the service layer.
- [ ] Add workflow run status checks, step status checks, dispatch status checks, and idempotency uniqueness on workspaceId/idempotencyKey. A nullable key must allow multiple absent keys.
- [ ] Add workflow step attempt uniqueness on workflowRunId/stepId/attempt. Store durable safeInput/safeOutput separately from safe observability metadata.
- [ ] Add nullable workflow_step_runs.agentRunId with ON DELETE SET NULL and ensure the linked AgentRun remains workspace-owned.
- [ ] Add Drizzle relations and include all tables in the exported schema object.
- [ ] Run npm run db:generate, inspect the generated SQL and migration metadata, and confirm no existing table is dropped or altered destructively.
- [ ] Run schema tests, npm run typecheck, and docker compose config.

### Task 4: Add authorization, audit contracts, and workflow service transactions

**Files:**

- Modify: lib/authz/authorization.ts
- Modify: lib/audit/service.ts
- Modify: lib/security/errors.ts
- Create: lib/workflows/service.ts
- Modify: lib/database/schema.ts only if relation typing requires it
- Create: tests/workflow-service.test.ts
- Create: tests/workflow-authorization.test.ts

**Interfaces:**

    export type WorkflowAction =
      | "workflow.read"
      | "workflow.run"
      | "workflow.write"
      | "workflow.delete"
      | "workflow.cancel";

    export interface CreateWorkflowInput {
      workspaceId: string;
      name: string;
      description: string;
      definition: WorkflowDefinition;
      enabled: boolean;
    }

    export function createWorkflow(userId: string, input: CreateWorkflowInput, db?: Database): Promise<WorkflowDefinitionRecord>;
    export function updateWorkflow(userId: string, workflowId: string, input: UpdateWorkflowInput, db?: Database): Promise<WorkflowDefinitionRecord>;
    export function createWorkflowRun(userId: string, workflowId: string, input: JsonValue, idempotencyKey?: string, db?: Database): Promise<WorkflowRun>;
    export function cancelWorkflowRun(userId: string, runId: string, db?: Database): Promise<WorkflowRun>;
    export function getWorkflowRun(userId: string, runId: string, db?: Database): Promise<WorkflowRunHistory>;

**Steps:**

- [ ] Write failing authorization tests for member read/run, admin/owner write/delete, member-owned cancellation, admin/owner cancellation of another member's run, and cross-workspace non-leaking 404 responses.
- [ ] Write failing service tests for create, update, soft delete, enable/disable, version increment, snapshot creation, idempotency reuse, and audit events.
- [ ] Run focused tests and confirm failure.
- [ ] Add workflow actions to the existing role policy without changing agent, brand, workspace, or membership behavior.
- [ ] Add workflow audit action/resource unions and reuse recordAuditEvent sanitization.
- [ ] Implement createWorkflow as a transaction that validates the definition, inserts workflows version 1, inserts workflow_versions version 1, and returns the current record.
- [ ] Implement updateWorkflow as a transaction that loads the authorized workflow, validates the complete candidate definition, inserts a new immutable version, and updates currentVersion/currentVersionId together. Never update workflow_versions.definition.
- [ ] Implement createWorkflowRun as a transaction that authorizes an enabled workflow, revalidates referenced resources, copies the exact version definition into definitionSnapshot, bounds input, handles PostgreSQL idempotency reuse, inserts the run, inserts one outbox row, and records workflow.run_queued.
- [ ] Implement cancelWorkflowRun with a guarded status update. MEMBER cancellation requires startedBy equal to the authenticated user; ADMIN/OWNER may cancel any cancellable run in the workspace. Terminal runs are returned unchanged.
- [ ] Implement safe run history with bounded durable outputs and observability, never raw model/tool data.
- [ ] Run focused tests, existing authorization tests, npm run typecheck, and npm run lint.

### Task 5: Implement BullMQ queue and reusable transactional outbox dispatcher

**Files:**

- Create: lib/queue/connection.ts
- Create: lib/workflows/queue.ts
- Create: lib/workflows/outbox.ts
- Test: tests/workflow-outbox.test.ts

**Interfaces:**

    export const WORKFLOW_QUEUE_NAME = "flowyn-workflows";
    export function workflowJobId(runId: string): string;
    export function enqueueWorkflowRun(runId: string): Promise<void>;
    export function dispatchPendingWorkflowRuns(options?: {
      limit?: number;
      dispatcherId?: string;
    }): Promise<{ dispatched: number; failed: number }>;

**Steps:**

- [ ] Write failing outbox tests for deterministic job IDs, pending claim, concurrent claim protection, successful enqueue, enqueue failure, stale claim recovery, and dispatch idempotency.
- [ ] Run focused tests and confirm failure.
- [ ] Create separate BullMQ-compatible Redis connections using REDIS_URL and existing ioredis. Configure worker connections with the settings required for blocking BullMQ operations.
- [ ] Define a Queue named flowyn-workflows and enqueue jobs containing only runId with jobId workflow-run:<runId>.
- [ ] Implement dispatchPendingWorkflowRuns as a reusable service. Claim pending rows atomically using dispatcherId and lease expiry, then enqueue the deterministic job, and update the dispatch row with guarded success/failure state.
- [ ] Ensure a process crash between Redis enqueue and database acknowledgement is recoverable without creating a second logical workflow run.
- [ ] Ensure failed dispatches remain inspectable and retryable with bounded backoff/attempt counts.
- [ ] Run focused tests and npm run typecheck.

### Task 6: Implement statically registered deterministic step executors

**Files:**

- Create: lib/workflows/registry.ts
- Create: lib/workflows/executors/set-value.ts
- Create: lib/workflows/executors/transform.ts
- Create: lib/workflows/executors/condition.ts
- Test: tests/workflow-registry.test.ts
- Test: tests/workflow-executors.test.ts

**Interfaces:**

    export interface WorkflowStepExecutor<TConfig> {
      type: WorkflowStepType;
      configSchema: ZodType<TConfig>;
      execute(
        context: WorkflowStepExecutionContext,
        config: TConfig
      ): Promise<WorkflowStepResult>;
    }

    export class WorkflowStepRegistry {
      register<TConfig>(executor: WorkflowStepExecutor<TConfig>): void;
      get(type: WorkflowStepType): WorkflowStepExecutor<unknown>;
    }

    export function createDefaultWorkflowStepRegistry(): WorkflowStepRegistry;

**Steps:**

- [ ] Write failing registry tests for duplicate registration, exact type lookup, unknown step rejection, and static registration.
- [ ] Write failing executor tests for literal/reference SET_VALUE, select/lowercase/uppercase/concat/object TRANSFORM, all CONDITION operators, missing values, output bounds, and unsafe inputs.
- [ ] Run focused tests and confirm failure.
- [ ] Implement the registry with a fixed server-side map. Do not import modules based on workflow JSON.
- [ ] Implement SET_VALUE through resolveValueExpression and sanitizeWorkflowValue.
- [ ] Implement TRANSFORM with only the five schema-defined deterministic operations and bounded intermediate values.
- [ ] Implement CONDITION without LLM calls. Return the selected validated edge and a boolean durable output.
- [ ] Ensure every result contains actual durable output plus separate safe metadata such as output size and operation name.
- [ ] Run focused tests, npm run typecheck, and npm run lint.

### Task 7: Implement lease-aware workflow execution and AI/Agent steps

**Files:**

- Create: lib/workflows/executors/ai-generate.ts
- Create: lib/workflows/executors/agent.ts
- Create: lib/workflows/executor.ts
- Modify: lib/agents/runner.ts only for the narrow onRunCreated linkage hook
- Modify: lib/agents/service.ts only for safe subordinate-run reconciliation if required
- Test: tests/workflow-runner.test.ts
- Test: tests/workflow-executors.test.ts

**Interfaces:**

    export interface ExecuteWorkflowRunOptions {
      runId: string;
      registry?: WorkflowStepRegistry;
      db?: Database;
      provider?: LLMProvider;
      workerId: string;
    }

    export interface WorkflowExecutorResult {
      runId: string;
      status: WorkflowStatus;
      stepCount: number;
      output: JsonValue | null;
      errorCode: string | null;
    }

    export function executeWorkflowRun(
      options: ExecuteWorkflowRunOptions
    ): Promise<WorkflowExecutorResult>;

    export interface RunAgentInput {
      userId: string;
      agentId: string;
      goal: string;
      provider?: LLMProvider;
      registry?: ToolRegistry;
      db?: Database;
      abortSignal?: AbortSignal;
      onRunCreated?: (run: AgentRun) => Promise<void>;
    }

**Steps:**

- [ ] Write failing runner tests for queued claim, immutable snapshot use after workflow update, SET_VALUE/TRANSFORM/CONDITION traversal, max-step enforcement, durable outputs, safe metadata, terminal transitions, and terminal duplicate delivery.
- [ ] Write failing lease tests for token claim, lease renewal, stale recovery, old-worker completion rejection, and new attempt creation after interruption.
- [ ] Write failing retry tests proving retryable executor errors create bounded new attempts while unknown and non-retryable errors fail immediately.
- [ ] Write failing cancellation tests for between-step cancellation, AI/Agent abort propagation, cancellation/completion races, and durable CANCELLED state.
- [ ] Write failing AI/Agent executor tests for workspace resource resolution, disabled/deleted agent rejection, cross-workspace rejection, bounded output, generation logging, and subordinate AgentRun linkage.
- [ ] Run focused tests and confirm failure.
- [ ] Implement guarded claim/lease functions that assign executionToken and lease expiry only when the run is QUEUED or stale RUNNING.
- [ ] Before each step, reload cancellation/lease state, enforce total timeout and max steps, and create an immutable attempt row.
- [ ] Run each executor with a per-step AbortController linked to the workflow controller. Persist durable input/output only after executor-specific validation and sanitization.
- [ ] Complete the step and advance currentStepId in one guarded transaction requiring workflowRunId, executionToken, and unexpired lease. Never update historical attempts.
- [ ] Implement conservative retry classification. AI/Agent timeouts are retryable only when the executor explicitly marks that operation safe; unknown errors are non-retryable.
- [ ] Implement AI_GENERATE through prepareGeneration/generateText with the workflow actor and AbortSignal. Do not import Ollama from workflow code.
- [ ] Implement AGENT by resolving the current authorized agent, invoking runAgent, bounding the final response, and persisting only a subordinate AgentRun ID link plus workflow-owned durable output.
- [ ] Add onRunCreated to AgentRunner only if needed to link the AgentRun before model execution. Preserve all existing M5 runner behavior and tests.
- [ ] Mark stale subordinate AgentRuns failed with a safe interruption code only through a workspace-safe reconciliation helper; do not duplicate their rows.
- [ ] Run focused tests, all existing agent tests, all existing AI/RAG tests, npm run typecheck, and npm run lint.

### Task 8: Add independently startable worker, heartbeat, and Compose service

**Files:**

- Create: lib/workflows/worker.ts
- Create: worker/workflow-worker.ts
- Create: scripts/check-worker-health.ts
- Modify: package.json
- Modify: docker-compose.yml
- Test: tests/workflow-worker.test.ts

**Interfaces:**

    export interface WorkflowWorkerOptions {
      workerId: string;
      concurrency: number;
      registry?: WorkflowStepRegistry;
    }

    export function startWorkflowWorker(
      options?: Partial<WorkflowWorkerOptions>
    ): Promise<{ close(): Promise<void> }>;

**Steps:**

- [ ] Write failing worker tests for BullMQ job consumption, dispatcher scheduling, heartbeat refresh, graceful close, terminal duplicate job handling, and handler error classification.
- [ ] Run the focused worker test and confirm failure.
- [ ] Implement the worker bootstrap around BullMQ Worker with bounded concurrency and the existing workflow queue.
- [ ] Invoke dispatchPendingWorkflowRuns on startup and at a bounded interval. The dispatcher remains a reusable lib/workflows/outbox.ts service rather than worker-only logic.
- [ ] Add Redis heartbeat key flowyn:worker:heartbeat with a TTL and worker ID. Implement scripts/check-worker-health.ts to fail when no fresh heartbeat exists.
- [ ] Add npm scripts worker and worker:health. Use worker/workflow-worker.ts as the dedicated entrypoint.
- [ ] Add a worker Compose service using the existing application image, database/Redis/Ollama service dependencies, the same trusted environment, and no new database or volume.
- [ ] Add the worker healthcheck using the heartbeat script. Do not use a process-only healthcheck that can pass when the worker loop is dead.
- [ ] Run workflow-worker tests, docker compose config, and npm run typecheck.

### Task 9: Add protected workflow APIs, minimal structured UI, and audit surface

**Files:**

- Create: app/api/workflows/route.ts
- Create: app/api/workflows/[id]/route.ts
- Create: app/api/workflows/[id]/runs/route.ts
- Create: app/api/workflow-runs/[id]/route.ts
- Create: app/api/workflow-runs/[id]/cancel/route.ts
- Create: components/forms/workflow-panel.tsx
- Modify: app/(dashboard)/dashboard/page.tsx
- Test: tests/workflow-routes.test.ts
- Test: tests/workflow-panel.test.tsx or a route-contract test if component testing is unavailable

**Steps:**

- [ ] Write failing route tests for authentication, strict body validation, CRUD status codes, workflow ownership, version transaction behavior, disabled-run rejection, run 202 response, idempotency header reuse, safe history, and cancellation authorization.
- [ ] Write failing route tests proving a MEMBER cannot cancel another MEMBER's run and cross-workspace resources return non-leaking not-found responses.
- [ ] Run focused route tests and confirm failure.
- [ ] Implement thin route handlers using requireUser, Zod readJson, workflow services, and errorResponse. No route directly executes a workflow.
- [ ] Validate and bound the Idempotency-Key header before passing it to createWorkflowRun. The service remains responsible for PostgreSQL uniqueness and workspace verification.
- [ ] Implement GET/POST workflow definitions, GET/PATCH/DELETE workflow definitions, POST runs, GET run history, and POST cancellation.
- [ ] Return bounded durable output and safe observability. Never return hidden reasoning, raw model observations, credentials, or unrestricted tool output.
- [ ] Implement a structured editor/form for metadata and JSON-defined steps with validation feedback, enable/disable, manual run, run status, safe output/error, and cancellation.
- [ ] Ensure the UI is not an authorization source and does not implement a drag-and-drop canvas.
- [ ] Run route/UI tests, existing route/security tests, npm run lint, npm run typecheck, and npm run build.

### Task 10: Add real integration verification, documentation, and final acceptance

**Files:**

- Create: tests/workflow.integration.test.ts
- Create: tests/workflow-ollama.integration.test.ts
- Modify: scripts/verify-local.ps1
- Modify: README.md
- Modify: ARCHITECTURE.md
- Modify: SECURITY.md
- Modify: AI.md
- Modify: SETUP.md

**Steps:**

- [ ] Write an opt-in PostgreSQL/Redis/BullMQ integration test gated by RUN_WORKFLOW_INTEGRATION=1. Use a temporary workspace, workflow, real queue, real worker/consumer, and temporary input. Assert queued, running, step output, completed state, and historical safe output.
- [ ] Add integration coverage for transactional outbox recovery by inserting a pending dispatch, running dispatchPendingWorkflowRuns, simulating a post-enqueue acknowledgement failure, and confirming deterministic job identity plus one logical run.
- [ ] Add integration coverage for immutable snapshots and version transactions: create version 1, queue a run, update to version 2, and assert the run executes version 1 while new runs use version 2.
- [ ] Add integration coverage for SET_VALUE, TRANSFORM, CONDITION, AI_GENERATE, and AGENT. For AGENT, create temporary brand knowledge stating that Flowyn's campaign color is violet, create an authorized brand-bound agent, and assert subordinate AgentRun linkage where implemented.
- [ ] Add integration coverage for leases, stale worker protection, bounded retries, cancellation authorization, durable cancellation, cross-workspace agent rejection, and duplicate job delivery.
- [ ] Update scripts/verify-local.ps1 to check workflow tables, constraints, indexes, outbox fields, worker heartbeat, existing database migration, and a clean temporary database migration. Do not reset existing data or delete volumes.
- [ ] Run guarded real integrations for Ollama, embeddings, knowledge/RAG, agent runtime, and workflow/BullMQ sequentially to avoid local model contention.
- [ ] Document workflow definitions, immutable versions/snapshots, graph limits, output versus observability, outbox recovery, worker startup, at-least-once semantics, retries, leases, cancellation authorization, referenced-resource semantics, supported steps, security restrictions, and local commands.
- [ ] Run the required final checks:

    npm run typecheck
    npm run lint
    npm test -- --run
    npm run build
    docker compose config
    docker compose up -d --build
    docker compose ps -a
    .\scripts\verify-local.ps1

- [ ] Verify Docker app, worker, PostgreSQL, Redis, and Ollama health; BullMQ enqueue/consume; outbox recovery; duplicate job handling; workflow version transaction; immutable snapshot; graph validation; context/reference security; all five built-in steps; retries; leases; cancellation; workspace isolation; subordinate AgentRun linkage; crash/recovery behavior; and M1-M5 regression.
- [ ] Review generated migration SQL, git diff --check, dependency changes, Docker volumes, and the explicit Milestone 7 exclusion.
- [ ] Commit only after every required check passes with an imperative message such as feat: add durable workflow execution. Do not push.

## Self-review checklist

- [ ] Every approved refinement has an implementation task: reusable outbox dispatcher, durable output distinction, scoped idempotency, conservative retries, cancellation authorization, version transaction, leases, stale-worker protection, AgentRun linkage, referenced-resource semantics, graph scope, security restrictions, BullMQ dependency boundary, and final verification.
- [ ] Every spec table has a schema/migration task and a persistence/authorization task.
- [ ] Every supported step has a registry/executor/test path.
- [ ] Every API has a thin route task and an authorization test.
- [ ] Every required verification item has an integration or final-acceptance step.
- [ ] No task introduces Milestone 7 behavior or external integrations.
