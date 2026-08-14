# Milestone 5 Agentic AI Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a provider-agnostic, workspace-safe, synchronous agent runtime with persistent definitions/runs, a server-controlled tool registry, bounded execution, safe history, protected APIs, and a minimal dashboard UI.

**Architecture:** Keep Flowyn as a modular monolith. Add focused lib/agents services around the existing LLMProvider.generateStructured() contract, use server-created trusted runtime context, separate bounded model observations from safe persisted summaries, and soft-delete definitions so run history survives. Keep the runner transport-independent enough for a later worker without adding workers, queues, or scheduling now.

**Tech Stack:** Next.js App Router, TypeScript strict mode, Drizzle ORM, PostgreSQL 16, Redis/Ollama Compose services, existing LLMProvider, Zod, Vitest, Tailwind, and existing shadcn-compatible components.

**Spec:** docs/superpowers/specs/2026-08-14-milestone-5-agentic-ai-engine-design.md

## Global Constraints

- Implement Milestone 5 only; do not implement the visual workflow canvas, workflow execution, workers, queues, scheduling, webhooks, integrations, approvals, billing, marketplace features, or Milestone 6 behavior.
- Preserve Milestones 1-4 behavior unless the backward-compatible AbortSignal extension is required by the agent runner.
- The effective runtime tool set is configured tools INTERSECT registered tools INTERSECT tools valid for the trusted runtime context; the model never determines it.
- Brand-dependent tools are not exposed when the trusted runtime context has no authorized brand.
- Keep model observations bounded and untrusted; persist only safe summaries and structured externally relevant decisions.
- Never request, parse, log, or persist private chain-of-thought.
- Never expose shell execution, filesystem access, arbitrary SQL, arbitrary HTTP, browser automation, dynamic code execution, or external integrations.
- Persist CANCELLED only when an abort is actually observed; durable user cancellation is deferred.
- Agent DELETE is soft deletion through deletedAt plus enabled = false; historical runs and steps remain intact.
- Run execution is synchronous in Milestone 5; do not add detached tasks, BullMQ, workers, distributed execution, or scheduling.
- Use existing server-side authorization and non-leaking 404 patterns; never trust client workspace, brand, user, agent, or run ownership claims.
- Add Zod validation for every request body and strict schemas for every tool input and structured decision.
- Do not reset the existing database, delete Docker volumes, upgrade dependencies unnecessarily, push, or commit the final implementation before every verification gate passes.
- Keep implementation changes uncommitted until final verification; commit only the approved design/plan checkpoint and the fully verified implementation.

## File map

Create focused agent modules:

- lib/agents/decisions.ts: strict discriminated decisions and inferred types.
- lib/agents/policy.ts: environment-backed policy and limit validation.
- lib/agents/prompt.ts: trusted/untrusted prompt sections and bounded observations.
- lib/agents/registry.ts: exact registration, public definitions, and effective allowlists.
- lib/agents/runner.ts: bounded provider-agnostic loop and abort handling.
- lib/agents/service.ts: authorized definitions, run creation, status/history, and soft deletion.
- lib/agents/validation.ts: agent CRUD, run, and query schemas.
- lib/agents/tools/search-brand-knowledge.ts: brand-scoped retrieval tool.
- lib/agents/tools/get-brand-profile.ts: brand-scoped profile tool.

Modify existing cross-cutting files only where required:

- lib/env.ts, .env.example, docker-compose.yml
- lib/ai/types.ts, lib/ai/ollama-provider.ts
- lib/authz/authorization.ts, lib/audit/service.ts, lib/security/errors.ts
- lib/database/schema.ts
- dashboard and documentation files

Create focused tests under tests/ for every new behavior and regression.

---

### Task 1: Add agent policy, types, decisions, and abort-capable provider inputs

**Files:**

- Modify: lib/env.ts
- Modify: .env.example
- Modify: docker-compose.yml
- Modify: lib/ai/types.ts
- Modify: lib/ai/ollama-provider.ts
- Create: lib/agents/policy.ts
- Create: lib/agents/decisions.ts
- Test: tests/agent-policy.test.ts
- Test: tests/agent-decisions.test.ts
- Test: tests/ollama-provider.test.ts

**Interfaces:**

    export interface AgentExecutionPolicy {
      maxSteps: number;
      hardMaxSteps: number;
      totalTimeoutMs: number;
      modelTimeoutMs: number;
      toolTimeoutMs: number;
      maxGoalChars: number;
      maxObservationChars: number;
      maxFinalResponseChars: number;
    }

    export type AgentDecision =
      | { type: "tool"; tool: { name: string; arguments: Record<string, unknown> } }
      | { type: "final"; final: string };

- [ ] Write failing policy tests for defaults, hard-limit rejection, timeout bounds, goal/observation/final-response limits, and a requested maxSteps above the server hard limit.
- [ ] Write failing decision tests for valid final/tool decisions, unknown extra keys, missing arguments, empty names, and malformed partial decisions.
- [ ] Run npm.cmd test -- --run tests/agent-policy.test.ts tests/agent-decisions.test.ts and confirm the new modules are missing.
- [ ] Add the seven trusted environment values with defaults 5, 12, 120000, 15000, 4000, 6000, and 8000; reuse AI_REQUEST_TIMEOUT_MS as modelTimeoutMs.
- [ ] Add optional signal?: AbortSignal to LLMGenerateInput; LLMStructuredInput inherits it without changing existing callers.
- [ ] Update OllamaProvider request and stream paths to combine caller abort signals with the provider timeout and preserve existing error mapping when no signal is provided.
- [ ] Implement the policy and strict discriminated union without accepting reasoning or identity fields.
- [ ] Run the focused tests plus npm.cmd test -- --run tests/ollama-provider.test.ts and npm.cmd run typecheck.

### Task 2: Add persistent agent/run/step schema and generated migration

**Files:**

- Modify: lib/database/schema.ts
- Modify: lib/authz/authorization.ts for agent action types
- Modify: lib/audit/service.ts for agent actions/resources
- Create through Drizzle: db/migrations/0004_*.sql, db/migrations/meta/0004_snapshot.json, and journal entry
- Test: tests/agent-schema.test.ts

**Interfaces:**

    export type AgentRunStatus =
      | "PENDING"
      | "RUNNING"
      | "COMPLETED"
      | "FAILED"
      | "CANCELLED"
      | "MAX_STEPS_REACHED";

    export type AgentRunStepType =
      | "MODEL_DECISION"
      | "TOOL_CALL"
      | "TOOL_RESULT"
      | "FINAL_RESPONSE"
      | "ERROR";

- [ ] Write schema contract tests requiring agents, agentRuns, and agentRunSteps, workspace ownership, nullable brand association, allowedTools, enabled, deletedAt, run statuses, step types, safe metadata JSONB fields, final response, indexes, and foreign-key behavior.
- [ ] Run npm.cmd test -- --run tests/agent-schema.test.ts and confirm failure.
- [ ] Add Drizzle tables with UUID keys, workspace indexes, agent/run/status indexes, status/type check constraints, and ON DELETE SET NULL for agent brand association.
- [ ] Keep run history independent of definition deletion by retaining runs and using nullable agent references or a safe agent-name snapshot; cascade only run steps from their run.
- [ ] Add explicit agent.read, agent.run, agent.write, and agent.delete authorization actions without changing existing role behavior.
- [ ] Add lower-case dotted audit action/resource types.
- [ ] Run npm.cmd run db:generate, inspect generated SQL, then run schema tests and docker compose config.
- [ ] Do not hand-edit generated metadata; only add SQL manually if Drizzle cannot express a required check/index and document the reason in the implementation diff.

### Task 3: Implement the typed tool contract and effective registry

**Files:**

- Create: lib/agents/registry.ts
- Create: lib/agents/tools/types.ts if shared types improve module boundaries
- Create: lib/agents/tools/search-brand-knowledge.ts
- Create: lib/agents/tools/get-brand-profile.ts
- Test: tests/agent-registry.test.ts
- Test: tests/agent-tools.test.ts

**Interfaces:**

    interface ToolExecutionContext {
      workspaceId: string;
      userId: string;
      agentId: string;
      runId: string;
      brandId?: string;
      abortSignal: AbortSignal;
    }

    interface SafeToolObservation {
      metadata: Record<string, string | number | boolean | null>;
      durationMs: number;
      characterCount: number;
    }

    interface ToolExecutionResult<TOutput> {
      modelObservation: TOutput;
      safeSummary: SafeToolObservation;
    }

    interface AgentTool<TInput, TOutput> {
      name: string;
      description: string;
      inputSchema: ZodSchema<TInput>;
      inputDescription: string;
      requiresBrand: boolean;
      execute(input: TInput, context: ToolExecutionContext):
        Promise<ToolExecutionResult<TOutput>>;
      serializeObservation(output: TOutput): string;
    }

- [ ] Write failing registry tests for duplicate registration, exact-name lookup, unknown tools, configured allowlists, and brand-dependent filtering before prompt exposure.
- [ ] Write failing tool tests proving search and profile tools use trusted context IDs, reject model-supplied identity arguments, and return separate observations/summaries.
- [ ] Run both focused tests and confirm failure.
- [ ] Implement strict schemas: search accepts only query and optional topK; profile accepts only an empty object.
- [ ] Implement search_brand_knowledge through retrieveKnowledge using context userId/brandId, and bound the model observation without using it as the persistence summary.
- [ ] Implement get_brand_profile through the authorized brand service and return only safe profile fields.
- [ ] Implement the registry intersection configured INTERSECT registered INTERSECT validForContext; require brand tools to have a trusted brand ID.
- [ ] Run focused tests and npm.cmd run typecheck.

### Task 4: Implement agent definition CRUD, soft deletion, and authorization

**Files:**

- Create: lib/agents/validation.ts
- Modify: lib/agents/service.ts
- Modify: lib/brands/service.ts only if brand deletion needs explicit agent association handling
- Test: tests/agent-service.test.ts
- Test: tests/agent-authorization.test.ts

**Interfaces:**

    export const agentCreateSchema: z.ZodType;
    export const agentPatchSchema: z.ZodType;
    export const agentRunSchema: z.ZodType;

    export function createAgent(userId: string, input: AgentCreateInput, db?: Database): Promise<AgentDefinition>;
    export function listAgents(userId: string, workspaceId: string, db?: Database): Promise<AgentDefinition[]>;
    export function getAgent(userId: string, agentId: string, db?: Database): Promise<AgentDefinition>;
    export function updateAgent(userId: string, agentId: string, input: AgentPatchInput, db?: Database): Promise<AgentDefinition>;
    export function deleteAgent(userId: string, agentId: string, db?: Database): Promise<void>;

- [ ] Write failing service tests for create/list/get/update/soft-delete, enabled versus deleted semantics, max-step validation, allowed-tool validation, audit events, and optional brand ownership.
- [ ] Write failing isolation tests proving workspace A cannot list, read, update, delete, or run workspace B agents.
- [ ] Run focused tests and confirm failure.
- [ ] Implement strict input schemas with workspaceId, optional brandId, allowedTools, and bounded fields; reject identity fields on patch/run bodies where they are not valid.
- [ ] Resolve workspace membership before resource access, resolve brands through getBrand, and require agent.write/agent.delete roles for mutations.
- [ ] Implement DELETE as a transaction that sets deletedAt and enabled = false, records agent.deleted, and preserves run rows.
- [ ] Ensure normal lists/lookups exclude deleted definitions while history lookup can still resolve their run ownership.
- [ ] Run focused tests plus existing workspace/brand authorization tests.

### Task 5: Implement bounded AgentRunner and safe persistence

**Files:**

- Create: lib/agents/prompt.ts
- Create: lib/agents/runner.ts
- Modify: lib/agents/service.ts for run/history persistence helpers
- Modify: lib/security/errors.ts for safe agent error mappings
- Test: tests/agent-prompt.test.ts
- Test: tests/agent-runner.test.ts

**Interfaces:**

    export interface AgentRunRequest {
      userId: string;
      agentId: string;
      goal: string;
      abortSignal?: AbortSignal;
      provider?: LLMProvider;
      db?: Database;
    }

    export interface AgentRunnerResult {
      runId: string;
      status: AgentRunStatus;
      stepCount: number;
      finalResponse: string | null;
      errorCode: string | null;
    }

    export function runAgent(request: AgentRunRequest): Promise<AgentRunnerResult>;

- [ ] Write failing runner tests for final decisions, one allowed tool followed by final, unknown tools, disallowed tools, invalid tool input, malformed output, provider errors, tool errors, disabled/deleted agents, max-step termination, bounded observation history, final-response truncation, and safe step types.
- [ ] Write abort tests for model timeout, tool timeout, total timeout, request abort, and persistence of CANCELLED only after an observed abort.
- [ ] Run focused tests and confirm failure.
- [ ] Implement createRun, recordRunStep, completeRun, and failRun helpers with safe metadata only.
- [ ] Build prompts with trusted policy/tool definitions and delimited untrusted goal/observations; never request reasoning.
- [ ] Create the total abort controller, connect request abort, apply model/tool/total timeouts, and check abort state before each next iteration.
- [ ] For each iteration call provider.generateStructured with agentDecisionSchema and signal, validate the decision, resolve the effective registry tool, validate input, and execute with trusted context.
- [ ] Persist MODEL_DECISION, TOOL_CALL, TOOL_RESULT, FINAL_RESPONSE, and ERROR summaries without raw model observations or chain-of-thought.
- [ ] Mark terminal statuses deterministically: COMPLETED, FAILED, CANCELLED, or MAX_STEPS_REACHED; truncate final response before persistence.
- [ ] Run focused tests, full existing AI tests, and npm.cmd run typecheck.

### Task 6: Add protected agent and run APIs

**Files:**

- Create: app/api/agents/route.ts
- Create: app/api/agents/[id]/route.ts
- Create: app/api/agents/[id]/runs/route.ts
- Create: app/api/agent-runs/[id]/route.ts
- Modify: lib/security/errors.ts if route-safe mappings are incomplete
- Test: tests/agent-routes.test.ts

- [ ] Write failing route tests for authentication, malformed bodies, workspace/brand relationship checks, non-leaking 404 responses, CRUD status codes, soft deletion, disabled-agent rejection, run goal validation, and safe run-history output.
- [ ] Write a route test proving the run body cannot supply workspaceId, brandId, userId, agentId, allowedTools, or policy values.
- [ ] Run focused route tests and confirm failure.
- [ ] Implement thin handlers using requireUser, Zod readJson, agent services, runAgent, and errorResponse.
- [ ] Make POST /api/agents/:id/runs synchronous and return only terminal run data; preserve the run ID in safe execution errors.
- [ ] Make GET /api/agent-runs/:id authorize through the persisted run workspace and return ordered safe steps only.
- [ ] Map required agent errors to safe HTTP responses without stack traces, provider URLs, raw prompts, or tool output.
- [ ] Run route tests and existing route/security tests.

### Task 7: Add minimal agent dashboard UI

**Files:**

- Create: components/forms/agent-panel.tsx
- Modify: app/(dashboard)/dashboard/page.tsx
- Create or modify: app/api/agents/tools/route.ts only if the UI needs a server-provided catalog
- Test: tests/agent-panel.test.tsx or tests/agent-route-contract.test.ts if component rendering is unavailable

- [ ] Write a UI contract test for loading workspaces/brands, creating an agent with configured tools, submitting a goal, displaying terminal status, and showing safe step summaries.
- [ ] Implement workspace/brand selection, name/description/system instruction fields, effective tool checkboxes, maxSteps validation, enabled state, and soft-delete/update controls.
- [ ] Prevent the client from becoming an authorization source: the tool catalog is descriptive only, and the server revalidates all tools and relationships.
- [ ] Implement synchronous run submission with bounded goal input and render final response, error, and status.
- [ ] Add the panel to the existing dashboard without altering Milestone 4 panels.
- [ ] Run the focused UI/contract test, lint, typecheck, and production build.

### Task 8: Add integration tests, documentation, verification, and final acceptance

**Files:**

- Create: tests/agent.integration.test.ts
- Create: tests/agent-ollama.integration.test.ts
- Modify: scripts/verify-local.ps1
- Modify: README.md
- Modify: ARCHITECTURE.md
- Modify: SECURITY.md
- Modify: AI.md
- Modify: SETUP.md

- [ ] Add PostgreSQL integration coverage for existing-database schema, clean temporary-database migration, agent/run/step persistence, soft deletion, workspace isolation, brand isolation, and safe history.
- [ ] Add an opt-in real Ollama test gated by RUN_OLLAMA_INTEGRATION=1: create temporary workspace/brand/knowledge, index “Flowyn's preferred campaign color is violet.”, create a brand-bound agent with the two tools, run the goal, assert at least one allowed tool step and final response containing violet, verify persisted run/steps, and clean only the temporary tenant.
- [ ] Extend scripts/verify-local.ps1 with agent table/status/index/foreign-key checks and the guarded agent integration test while keeping normal startup non-fragile.
- [ ] Document synchronous execution, non-durable cancellation, soft deletion, effective tool filtering, safe observation summaries, trusted context, known limitations, local Ollama requirements, and the Milestone 5 boundary.
- [ ] Run npm.cmd run db:migrate against the existing database and inspect schema with read-only SQL.
- [ ] Create an explicit temporary database, run all migrations, verify tables/constraints/indexes, and drop only that temporary database.
- [ ] Run the complete verification sequence with Docker and integration enabled:

    npm.cmd run typecheck
    npm.cmd run lint
    npm.cmd test -- --run
    npm.cmd run build
    docker compose config
    docker compose up -d --build
    docker compose ps
    $env:RUN_OLLAMA_INTEGRATION = "1"
    npm.cmd test -- --run tests/agent-ollama.integration.test.ts tests/agent.integration.test.ts tests/knowledge.integration.test.ts tests/ollama-embedding.integration.test.ts
    .\scripts\verify-local.ps1

- [ ] Run focused regression tests for RAG, knowledge retrieval, prompt injection, authorization, AI provider behavior, and all agent modules.
- [ ] Review git diff --check, git status, dependency files, migration SQL, Docker volumes, and Milestone 6 exclusion.
- [ ] Commit the implementation only after every gate passes with an imperative message such as feat: add controlled agent runtime; do not push.

## Acceptance checklist

- [ ] Agent definitions are workspace-owned, brand-validated, role-protected, and soft-deletable.
- [ ] Effective tools are the server-side intersection of configured, registered, and trusted-context-valid tools.
- [ ] Brand-dependent tools are absent from unbranded runtime prompts and cannot execute.
- [ ] Model observations are bounded and untrusted; persisted summaries are separate and safe.
- [ ] No private reasoning is requested or persisted.
- [ ] Runner has model, tool, total, step, context, and final-response limits.
- [ ] Abort is propagated and CANCELLED is persisted only when observed.
- [ ] Synchronous execution is documented and no worker/queue/scheduler is added.
- [ ] Runs and steps preserve history after soft deletion.
- [ ] Workspace and brand isolation tests pass.
- [ ] Real Ollama agent integration completes with the violet knowledge fact.
- [ ] Existing Milestone 1-4 tests, RAG behavior, migrations, Docker checks, typecheck, lint, build, and verification pass.
- [ ] Milestone 6 has not started.
