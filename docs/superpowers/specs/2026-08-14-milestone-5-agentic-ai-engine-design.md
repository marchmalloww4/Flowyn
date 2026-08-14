# Milestone 5 Agentic AI Engine Design

## Scope

Milestone 5 adds Flowyn's controlled agent runtime on top of the existing modular monolith. It adds persistent agent definitions, synchronous agent runs, safe step history, a provider-agnostic bounded agent loop, a server-side tool registry, two brand-aware internal tools, protected APIs, a minimal dashboard surface, and real opt-in Ollama verification.

Milestones 1-4 remain intact. This milestone does not add a visual workflow canvas, production workflow execution, queues, workers, scheduling, webhooks, external integrations, arbitrary HTTP, browser automation, shell execution, filesystem access, SQL tools, approvals, billing, marketplace features, or multi-agent orchestration.

## Existing architecture and reusable components

The implementation reuses the existing:

- LLMProvider and OllamaProvider abstraction for model calls.
- LLMProvider.generateStructured() and Zod validation for agent decisions.
- requireWorkspaceMember, requireWorkspaceAction, getBrand, and server-side session helpers.
- retrieveKnowledge for the brand knowledge tool.
- recordAuditEvent and its recursive sensitive-metadata sanitization.
- Drizzle schema, generated migration, and migration verification conventions.
- readJson, errorResponse, and thin protected route handlers.
- Dashboard shell and shadcn-compatible UI primitives.
- Existing AI timeout configuration and safe provider error hierarchy.

No second provider abstraction, authorization layer, retrieval implementation, or audit logger will be introduced.

## Design principles

1. The model proposes a structured next action; the server decides whether that action is valid and allowed.
2. Workspace, user, agent, run, and brand identity come only from trusted server context.
3. The effective runtime tool set is computed server-side as:

       configured agent tools
       INTERSECT registered tools
       INTERSECT tools valid for the trusted runtime context

4. Tool model observations and persisted observability summaries are separate values.
5. No private chain-of-thought is requested, inferred, or persisted.
6. Every loop has bounded steps, model-call timeout, tool timeout, total timeout, and cancellation observation.
7. The runner remains independent of request transport so a later worker can execute it without replacing the core loop.
8. Existing database data and Docker volumes are preserved.

## Runtime architecture

    Protected route
      -> authorized AgentService
      -> AgentRun persisted as RUNNING
      -> AgentRunner
           -> trusted AgentContext
           -> effective ToolRegistry view
           -> bounded agent prompt
           -> LLMProvider.generateStructured()
           -> validated AgentDecision
           -> tool schema and allowlist checks
           -> tool execution with trusted context
           -> bounded untrusted model observation
           -> safe persisted step summary
           -> next iteration
      -> terminal AgentRun and safe response

The Milestone 5 run endpoint is synchronous. POST /api/agents/:id/runs does not return until the run reaches a terminal state or the request fails. GET /api/agent-runs/:id exposes the persisted result and safe history after the synchronous request. This limitation is explicit; no in-process detached task, queue, worker, scheduler, or durable cross-request cancellation mechanism is introduced.

## Module layout

The new domain code lives under lib/agents:

    lib/agents/
      decisions.ts       structured decision schemas and types
      policy.ts          environment-backed execution limits
      prompt.ts          bounded trusted/untrusted agent prompt construction
      registry.ts        exact-name registration and effective allowlists
      runner.ts          provider-agnostic bounded loop
      service.ts         authorized definitions, runs, and history
      validation.ts      request and persistence-facing Zod schemas
      tools/
        search-brand-knowledge.ts
        get-brand-profile.ts

The existing lib/ai/types.ts gains an optional signal?: AbortSignal on model inputs. This is backward-compatible for existing callers and allows the runner to propagate request disconnects and timeouts to providers. OllamaProvider combines the caller signal with its existing per-request timeout.

## Agent definitions

The agents table contains:

- id UUID primary key.
- workspaceId UUID, not null, cascading workspace ownership.
- brandId UUID nullable, foreign-keyed with ON DELETE SET NULL.
- name, description, and systemInstructions text fields.
- allowedTools JSONB string array, defaulting to an empty array.
- enabled boolean, defaulting to true.
- maxSteps integer, bounded by service validation against the server hard limit.
- createdBy user ID.
- createdAt, updatedAt, and nullable deletedAt timestamps.

Agent names are indexed by workspace. The service rejects an optional brand that belongs to another workspace. A deleted brand nulls the association; brand-dependent tools then disappear from the effective runtime tool set.

Soft deletion is distinct from disablement:

- enabled = false: the definition remains visible and manageable, but new runs are rejected.
- deletedAt != null: normal list/get operations exclude the definition and new runs are rejected. Historical runs and steps remain available to authorized workspace members.

The DELETE API sets deletedAt and enabled = false; it never removes the definition or its history.

## Agent runs and safe step history

The agent_runs table contains:

- id, workspaceId, agentId, and startedBy ownership fields.
- status with PENDING, RUNNING, COMPLETED, FAILED, CANCELLED, and MAX_STEPS_REACHED constraints.
- A bounded goal text value.
- stepCount.
- A bounded finalResponse nullable text value.
- startedAt, completedAt, createdAt, and updatedAt.
- A safe errorCode.

The agent_run_steps table contains:

- id, runId, workspaceId, and stepNumber.
- type with MODEL_DECISION, TOOL_CALL, TOOL_RESULT, FINAL_RESPONSE, and ERROR constraints.
- Nullable toolName.
- status.
- safeInputMetadata and safeOutputMetadata JSONB values.
- Nullable errorCode.
- startedAt and completedAt.

MODEL_DECISION stores only the structured externally relevant decision type and requested tool name. It does not contain reasoning. Tool results store counts, durations, names, and safe error codes, never unrestricted tool output. The final response is persisted only after applying the server-side final-response hard limit.

Foreign keys cascade steps when a run is removed, while agent definitions are retained by soft deletion. Run history remains readable even when the definition is deleted; the run stores its own workspace and agent identifiers and a safe agent-name snapshot if needed by the history response.

## Tool abstraction and registry

The tool result has two distinct values:

- modelObservation: actual bounded information needed for the next model decision.
- safeSummary: operational metadata persisted in agent_run_steps.

The conceptual interfaces are:

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

modelObservation is serialized and bounded before insertion into an explicitly untrusted prompt section. It is not automatically persisted. safeSummary is the separate persistence/logging value and contains only safe operational metadata such as result count, character count, duration, tool name, or error code.

The registry rejects duplicate names, retrieves exact names only, exposes public descriptions for effective tools, and rejects unknown or disallowed tools. Tool schemas are strict, so model-supplied identity fields such as workspaceId or brandId are rejected rather than accepted and ignored.

Initial built-ins:

### search_brand_knowledge

Input: query and optional topK.

The server invokes retrieveKnowledge with workspaceId, userId, and brandId from ToolExecutionContext. The model cannot select another workspace, brand, or user.

### get_brand_profile

Input: an empty strict object.

The server resolves the context brand and returns a safe structured profile. User-authored brand values are treated as untrusted model data even though the brand identity itself is trusted.

Both tools require a brand. If the agent has no brand, these tools are removed before the prompt is built and cannot be executed during that run. The database may retain their configured names for future brand association, but the model sees only the effective server-side set.

No shell, filesystem, SQL, arbitrary HTTP, browser, dynamic code, external integration, or network tool is registered.

## Structured decisions

The runner uses a strict discriminated union with exactly two valid shapes:

- type tool with tool.name and tool.arguments.
- type final with final text.

Unknown keys, empty values, missing arguments, and partially valid tool calls fail as AGENT_INVALID_DECISION. No free-form text is parsed to decide execution, and no partially valid tool call runs. The runner does not request chain-of-thought or reasoning fields.

## Bounded execution policy and cancellation

Add environment-backed values:

    AGENT_MAX_STEPS_DEFAULT=5
    AGENT_MAX_STEPS_HARD_LIMIT=12
    AGENT_TOTAL_TIMEOUT_MS=120000
    AGENT_TOOL_TIMEOUT_MS=15000
    AGENT_MAX_GOAL_CHARS=4000
    AGENT_MAX_OBSERVATION_CHARS=6000
    AGENT_MAX_FINAL_RESPONSE_CHARS=8000

The existing AI_REQUEST_TIMEOUT_MS bounds each model call. Configuration validation rejects a default above the hard limit and invalid timeout or character ranges. Database/user-provided maxSteps values cannot exceed the hard limit.

The runner creates one total-run AbortController, propagates an incoming request signal where available, and applies model, tool, and total timers. It persists CANCELLED only when an abort is actually observed. User-triggered durable cancellation across requests is explicitly deferred because the synchronous Milestone 5 transport cannot guarantee it.

## Prompt and context management

The agent prompt contains trusted sections for immutable execution policy, agent configuration, effective tool definitions, and the structured decision contract.

It contains untrusted sections for the user goal, retrieved brand knowledge, tool model observations, and brand profile values.

Untrusted content is bounded and clearly delimited. It cannot change the effective allowlist, trusted IDs, policy, system instructions, or terminal-state handling. The runner keeps only the bounded recent observation history needed to decide the next action; it does not append unlimited output.

## Authorization and audit

Add explicit workspace actions:

- agent.read: all workspace members.
- agent.run: all workspace members for enabled, non-deleted agents.
- agent.write: ADMIN and OWNER.
- agent.delete: ADMIN and OWNER.

Every definition and run lookup resolves its owning workspace before membership or role checks. Run request bodies contain only the goal. The trusted runtime context is server-created:

    workspaceId
    userId
    agentId
    runId
    brandId
    abortSignal

Audit events use the existing lowercase dotted convention:

- agent.created
- agent.updated
- agent.deleted
- agent.run_started
- agent.run_completed
- agent.run_failed

Existing audit metadata sanitization remains the final filter. Goals, prompts, observations, credentials, and hidden reasoning are not placed in audit metadata.

## Protected APIs

Definition APIs:

- GET /api/agents?workspaceId=...
- POST /api/agents
- GET /api/agents/:id
- PATCH /api/agents/:id
- DELETE /api/agents/:id

Execution APIs:

- POST /api/agents/:id/runs with { goal } only.
- GET /api/agent-runs/:id for safe status and history.

The server derives workspace, user, brand, effective tools, and policy. Client-supplied workspace and brand values are accepted only as lookup inputs and are checked against server-side ownership. Run bodies cannot supply them.

Execution failures after a run is created update the persisted terminal status and return a safe typed error with the run identifier where useful. Authentication, authorization, validation, disabled, deleted, or not-found failures are rejected before execution. No stack traces, provider URLs, model secrets, or raw tool output are returned.

## Minimal UI

The dashboard receives an Agent panel for selecting a workspace and optional brand, creating/editing/soft-deleting definitions, entering system instructions, choosing registered tools, configuring a safe maximum step count, enabling/disabling an agent, entering a goal, and displaying synchronous run status, safe step summaries, final response, and errors.

The UI is a functional management surface only. It does not implement a visual workflow builder.

## Verification strategy

Unit tests cover decision schema validation, registry duplicate/unknown/allowlist behavior, brand-dependent effective tool filtering, tool argument authorization boundaries, model observation versus persistence summary separation, execution policy and context bounding, malformed decisions, provider errors, tool errors, timeouts, cancellation, max-step termination, soft deletion, disabled-agent behavior, and prompt-injection boundaries.

Authorization tests cover workspace and brand isolation for definitions, runs, and tools. Integration tests use PostgreSQL for migration, persistence, and isolation. The opt-in real Ollama test uses llama3.2:3b, nomic-embed-text, pgvector knowledge, and a temporary tenant to verify a real tool call and final answer containing violet.

Before completion, run typecheck, lint, the full test suite, production build, Docker Compose/runtime checks, existing and clean database migrations, guarded integration tests, RAG regression tests, and scripts/verify-local.ps1. Do not reset the existing database or delete Docker volumes. Do not commit the final implementation until all gates pass, and do not push or start Milestone 6.

