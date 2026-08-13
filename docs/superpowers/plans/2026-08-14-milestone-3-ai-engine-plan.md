# Milestone 3 AI Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a provider-agnostic, workspace-scoped AI generation engine with typed Ollama generation, native streaming, structured output validation, safe errors, generation logging, and real local runtime verification.

**Architecture:** Preserve `LLMProvider` as the canonical provider contract and extend it with complete generation, Zod-validated structured generation, native streaming, and health operations. Trusted server-side AI configuration selects Ollama; the generation service performs membership and optional brand checks, builds prompts, invokes the provider, records safe metadata, and exposes typed results to thin route handlers. The dashboard panel consumes the protected API and real SSE chunks.

**Tech Stack:** Next.js App Router route handlers, strict TypeScript, Zod, Drizzle/PostgreSQL, Vitest, native Fetch/ReadableStream, Ollama `/api/generate` NDJSON, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-08-14-milestone-3-ai-engine-design.md`

## Global Constraints

- Implement Milestone 3 only; do not implement RAG, embeddings, pgvector, documents, vector retrieval, agents, memory, planning, tools, workflows, BullMQ, scheduling, webhooks, approvals, integrations, billing, or editor features.
- Preserve existing authentication, workspace isolation, brand CRUD, health endpoints, Ollama configuration, and Milestone 1/2 tests.
- Keep `LLMProvider` as the application-facing interface; domain code must not import Ollama directly.
- Never accept an arbitrary model endpoint URL or provider implementation from a client request.
- Require authenticated workspace membership before any generation or brand-context read.
- Do not store prompts, responses, API keys, secrets, stack traces, or raw provider response bodies in generation logs or API responses.
- Use Zod at the generation request boundary and safe typed AI errors at the provider boundary.
- Do not add dependencies, run `npm audit fix --force`, delete Docker volumes, reset PostgreSQL, or destroy existing data.

---

### Task 1: Add failing AI engine contract tests

**Files:**
- Create: `tests/ai-config.test.ts`
- Create: `tests/ai-prompt.test.ts`
- Create: `tests/ai-errors.test.ts`
- Modify: `tests/ollama-provider.test.ts`
- Create: `tests/ai-structured.test.ts`
- Create: `tests/ai-streaming.test.ts`
- Modify: `tests/database-schema.test.ts`

**Interfaces:**
- `getAIConfig()` returns `{ provider, model, baseUrl, temperature, maxOutputTokens, timeoutMs, maxPromptChars }` from trusted environment values.
- `buildPrompt(input)` returns `{ system, prompt, totalChars }` and includes optional context, brand context, and output requirements.
- `LLMProvider.generateStructured()` parses JSON and validates a Zod schema; malformed JSON and schema mismatch produce `INVALID_STRUCTURED_OUTPUT`.
- `OllamaProvider.stream()` yields provider-native chunks and maps malformed/network/timeout/model failures to typed AI errors.

- [ ] **Step 1: Write configuration tests.** Assert default model `llama3.2:3b`, default timeout `60000`, bounded numeric settings, and provider selection from environment without exposing secrets.
- [ ] **Step 2: Write prompt tests.** Assert system/user sections, brand fields, output requirements, and total character accounting are deterministic.
- [ ] **Step 3: Extend provider tests with failing structured, model preflight, timeout, malformed response, and native streaming cases.** Use fetch fakes only; do not depend on external services.
- [ ] **Step 4: Add schema contract assertions for `generationLogs` fields and status values.**
- [ ] **Step 5: Run the focused tests and confirm they fail for missing interfaces/behavior.**

Run:

```powershell
npm.cmd test -- --run tests/ai-config.test.ts tests/ai-prompt.test.ts tests/ai-errors.test.ts tests/ollama-provider.test.ts tests/ai-structured.test.ts tests/ai-streaming.test.ts tests/database-schema.test.ts
```

Expected: RED failures caused by the unimplemented Milestone 3 contracts, not test syntax errors.

### Task 2: Implement trusted AI configuration, errors, prompts, and provider contracts

**Files:**
- Create: `lib/ai/config.ts`
- Create: `lib/ai/errors.ts`
- Create: `lib/ai/prompt.ts`
- Modify: `lib/env.ts`
- Modify: `lib/ai/types.ts`
- Modify: `lib/ai/ollama-provider.ts`
- Modify: `.env.example`
- Modify: `docker-compose.yml`

**Interfaces:**
```ts
export interface AIConfig {
  provider: "ollama";
  baseUrl: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  maxPromptChars: number;
}

export interface LLMProvider {
  generate(input: LLMGenerateInput): Promise<LLMResult>;
  generateStructured<T>(input: LLMStructuredInput<T>): Promise<LLMStructuredResult<T>>;
  stream(input: LLMGenerateInput): AsyncIterable<LLMStreamChunk>;
  health(): Promise<LLMHealthResult>;
}
```

- [ ] **Step 1: Add `AI_PROVIDER`, `AI_TEMPERATURE`, and `AI_MAX_OUTPUT_TOKENS` to environment validation and expose the same defaults through Compose and `.env.example`.** Keep `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `AI_REQUEST_TIMEOUT_MS`, and `MAX_GENERATION_PROMPT_CHARS` unchanged.
- [ ] **Step 2: Add `AIError` plus typed subclasses/codes for provider unavailable, model unavailable, timeout, invalid request, generation failure, and invalid structured output.** Give each a safe public message and HTTP status.
- [ ] **Step 3: Extend `lib/ai/types.ts` with structured and stream request/result types while retaining existing type names and health-code compatibility.** Export `AIProvider` as an alias of `LLMProvider`.
- [ ] **Step 4: Implement `buildPrompt()` with explicit system instructions, user instructions, context, brand context, output requirements, and character counting.** Keep prompt composition out of route handlers.
- [ ] **Step 5: Refactor `OllamaProvider` to use `AIConfig`, verify the configured model through `/api/tags`, parse complete responses, map safe typed errors, and enforce `AI_REQUEST_TIMEOUT_MS`.** Never include provider URLs or raw response text in errors.
- [ ] **Step 6: Implement `generateStructured()` with Ollama JSON mode, `JSON.parse`, and Zod `safeParse`; return `INVALID_STRUCTURED_OUTPUT` on either parse or validation failure.
- [ ] **Step 7: Implement `stream()` by reading Ollama’s actual newline-delimited JSON response body with a `ReadableStream` reader.** Yield chunks as they arrive, stop on Ollama `done`, and reject malformed chunks.
- [ ] **Step 8: Run focused tests and refactor only after green.**

### Task 3: Add generation persistence and migration

**Files:**
- Modify: `lib/database/schema.ts`
- Create: `lib/ai/generation-log.ts`
- Create: generated `db/migrations/0002_*.sql` and metadata
- Modify: `tests/database-schema.test.ts`
- Create: `tests/generation-log.test.ts`

**Interfaces:**
```ts
export type GenerationStatus = "SUCCEEDED" | "FAILED";

export interface GenerationLogInput {
  workspaceId: string;
  userId: string;
  provider: string;
  model: string;
  status: GenerationStatus;
  durationMs: number;
  inputChars: number;
  outputChars?: number;
  errorCode?: string;
}

export function recordGenerationLog(input: GenerationLogInput, db?: Database): Promise<void>;
```

- [ ] **Step 1: Write a failing test for safe generation log persistence and schema exports.** Assert prompts/responses are not fields in the generation table and status is constrained.
- [ ] **Step 2: Add `generation_logs` with UUID identity, workspace/user foreign keys, provider/model/status, duration/input/output counts, safe error code, created timestamp, and workspace/time lookup index.** Use `onDelete: "cascade"` for workspace and `set null` for user.
- [ ] **Step 3: Implement `recordGenerationLog()` as a thin database service with no prompt/response arguments.
- [ ] **Step 4: Run `npm.cmd run db:generate`, inspect the generated SQL, and confirm it is additive.** Do not hand-edit migration metadata.
- [ ] **Step 5: Apply the migration to the existing PostgreSQL volume with `docker compose exec -T app npm run db:migrate`; inspect the new table/index/constraint metadata.
- [ ] **Step 6: Run generation-log and schema tests.**

### Task 4: Implement workspace-scoped generation service and API

**Files:**
- Create: `lib/ai/validation.ts`
- Modify: `lib/ai/service.ts`
- Modify: `lib/http.ts` if invalid JSON needs a safe 400 response
- Modify: `app/api/ai/generate/route.ts`
- Modify: `app/api/ai/health/route.ts`
- Create: `tests/ai-generation-service.test.ts`
- Create: `tests/ai-generation-route.test.ts` where route behavior can be tested without external services

**Interfaces:**
```ts
export interface GenerationRequest {
  userId: string;
  workspaceId: string;
  brandId?: string;
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface PreparedGeneration {
  provider: LLMProvider;
  providerInput: LLMGenerateInput;
  config: AIConfig;
  workspaceId: string;
  userId: string;
  inputChars: number;
}

export function prepareGeneration(input: GenerationRequest, provider?: LLMProvider, db?: Database): Promise<PreparedGeneration>;
export function generateText(prepared: PreparedGeneration, db?: Database): Promise<LLMResult>;
export function streamText(prepared: PreparedGeneration, db?: Database): AsyncIterable<LLMStreamChunk>;
```

- [ ] **Step 1: Write failing service tests for required workspace membership, cross-workspace brand rejection, prompt limits, successful logging, failed logging, and provider injection.**
- [ ] **Step 2: Add `aiGenerationRequestSchema` requiring UUID `workspaceId`, non-empty prompt, optional UUID `brandId`, bounded generation overrides, and boolean `stream`; never accept a model or endpoint URL.**
- [ ] **Step 3: Implement provider selection in `getAIProvider()` from trusted `AIConfig`; retain `getLLMProvider()` as a compatibility alias.**
- [ ] **Step 4: Implement `prepareGeneration()` with membership authorization, optional authorized brand loading, workspace match enforcement, prompt building, and total-character limit validation.**
- [ ] **Step 5: Implement complete generation with safe success/failure logging.** Provider errors pass through as typed AI errors; unknown errors become `GENERATION_FAILED`.
- [ ] **Step 6: Implement native stream execution with success/failure logging and safe error normalization.**
- [ ] **Step 7: Update `POST /api/ai/generate` to authenticate, validate, prepare, and return either JSON or `text/event-stream` SSE events.** Emit provider chunks and a terminal `[DONE]`; if streaming fails after headers are sent, emit a safe error event.
- [ ] **Step 8: Update `/api/ai/health` to use the provider health result and preserve unavailable-vs-model-missing status codes.
- [ ] **Step 9: Run service/route tests and all existing tests.**

### Task 5: Update the dashboard AI panel for real streaming and brand context

**Files:**
- Modify: `components/forms/ai-generation-panel.tsx`
- Modify: `app/(dashboard)/dashboard/page.tsx` copy only as needed
- Modify: `README.md`, `SETUP.md`, `ARCHITECTURE.md`, `AI.md`, `SECURITY.md`

- [ ] **Step 1: Write a focused UI test if the existing test setup supports client components; otherwise keep the UI change covered by the live API regression and TypeScript/build checks.**
- [ ] **Step 2: Load workspaces and brands in the AI panel, require a selected workspace, and allow optional brand context selection.**
- [ ] **Step 3: Submit `stream: true` to the protected endpoint and parse SSE events incrementally with `ReadableStream.getReader()`; append only received text chunks.**
- [ ] **Step 4: Preserve loading, streaming, success, and safe error states; do not expose provider URLs or raw errors.**
- [ ] **Step 5: Update documentation to describe provider configuration, streaming, structured output, generation logs, and the Milestone 3 boundary.**

### Task 6: Add local integration coverage and complete verification

**Files:**
- Create: `tests/ollama.integration.test.ts`
- Modify: `tests/health.test.ts`, `tests/ollama-provider.test.ts`, and other tests only for regressions discovered during implementation
- Modify: `scripts/verify-local.ps1` only if needed for Milestone 3 messaging or integration invocation

- [ ] **Step 1: Add a local-only integration test guarded by `RUN_OLLAMA_INTEGRATION=1`; perform a real `llama3.2:3b` generation through `OllamaProvider` and assert non-empty text.** Default test runs remain service-independent.
- [ ] **Step 2: Run `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test -- --run`, and `npm.cmd run build`.**
- [ ] **Step 3: Run `docker compose config`, `docker compose up -d --build`, `docker compose ps`, and `docker compose exec -T app npm run db:migrate` without deleting volumes.**
- [ ] **Step 4: Verify `/api/health`, PostgreSQL, Redis, Ollama health, `/api/tags`, and the in-container Ollama client.**
- [ ] **Step 5: Run the `RUN_OLLAMA_INTEGRATION=1` equivalent in PowerShell and perform an authenticated real generation request with a temporary user/workspace/brand context; clean up temporary records through authorized APIs.**
- [ ] **Step 6: Run `./scripts/verify-local.ps1` and confirm Milestones 1/2 regression tests remain green.**
- [ ] **Step 7: Run `git diff --check`, inspect `git status`, and confirm no Milestone 4+ files or dependency upgrades were introduced.**

## Commits

Use focused commits after green task gates:

```text
test: define milestone 3 ai engine contracts
feat: add provider-agnostic ai engine
feat: add workspace-scoped generation logs
feat: protect ai generation with workspace context
feat: stream local ai output in dashboard
docs: document milestone 3 ai engine
```
