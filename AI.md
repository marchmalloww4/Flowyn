# Local AI

## Provider abstraction

Application code depends on the provider contract:

```ts
interface LLMProvider {
  generate(input: LLMGenerateInput): Promise<LLMResult>;
  generateStructured<T>(input: LLMStructuredInput<T>): Promise<LLMStructuredResult<T>>;
  stream(input: LLMGenerateInput): AsyncIterable<LLMStreamChunk>;
  health(): Promise<LLMHealthResult>;
}
```

`OllamaProvider` is the current implementation. The application depends on `LLMProvider`, not Ollama-specific code. Provider selection comes from trusted server-side `AI_PROVIDER` configuration; clients cannot supply a provider or endpoint URL.

## Configuration

```text
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
OLLAMA_EMBEDDING_DIMENSION=768
AI_TEMPERATURE=0.4
AI_MAX_OUTPUT_TOKENS=800
AI_REQUEST_TIMEOUT_MS=60000
MAX_GENERATION_PROMPT_CHARS=12000
```

The provider verifies the configured model through `/api/tags` before generation. Health distinguishes provider unavailability from a missing model.

## Generation flow

```text
Authenticated request
  -> workspace membership check
  -> Zod request validation and prompt builder
  -> optional authorized brand context
  -> optional bounded semantic retrieval through EmbeddingProvider
  -> configured LLMProvider
  -> Ollama /api/generate (stream=true or false)
  -> typed result or native SSE chunks
  -> safe generation metadata log
  -> dashboard output
```

Prompt size, temperature, timeout, and output token limits are bounded by environment-backed settings. Provider failures map to safe codes: `PROVIDER_UNAVAILABLE`, `MODEL_UNAVAILABLE`, `REQUEST_TIMEOUT`, `INVALID_REQUEST`, `GENERATION_FAILED`, and `INVALID_STRUCTURED_OUTPUT`.

## Structured output

Structured calls request Ollama JSON, parse the returned text with `JSON.parse`, and validate the value with the caller's Zod schema. Malformed JSON, markdown-wrapped output, and schema mismatches are rejected as `INVALID_STRUCTURED_OUTPUT`; model output is never trusted blindly.

## Streaming

`OllamaProvider.stream()` reads Ollama's actual newline-delimited JSON response body incrementally. The generation route forwards chunks as Server-Sent Events and the dashboard appends each received text chunk. The implementation does not fake streaming by splitting a completed response.

## Generation logging

`generation_logs` stores workspace/user, provider, model, success/failure status, duration, input/output character counts, safe error code, and creation time. Prompts and responses are not stored by default.

## Adding a provider later

1. Implement `LLMProvider` in a new provider module.
2. Keep provider-specific credentials in server-only environment configuration.
3. Map provider errors into the typed `AIError` hierarchy without returning secrets or URLs.
4. Select the provider in `lib/ai/service.ts` using explicit trusted configuration.
5. Add contract tests for generation, health, timeout, streaming, structured output, and model/configuration failures.

The agent and workflow milestones consume this interface, not Ollama directly.

## Milestone 5 agent runtime

The agent runner is provider-agnostic and uses `generateStructured()` with a strict two-branch decision: a registered tool call or a final response. The server calculates the effective tool set from the agent configuration, the registry, and trusted runtime context. Brand-dependent tools disappear from unbranded runs and cannot receive model-supplied workspace, user, or brand IDs.

Runs are synchronous and bounded by `AGENT_MAX_STEPS_DEFAULT`, `AGENT_MAX_STEPS_HARD_LIMIT`, `AGENT_TOTAL_TIMEOUT_MS`, `AGENT_TOOL_TIMEOUT_MS`, `AGENT_MAX_GOAL_CHARS`, `AGENT_MAX_OBSERVATION_CHARS`, and `AGENT_MAX_FINAL_RESPONSE_CHARS`. The existing `AI_REQUEST_TIMEOUT_MS` bounds each model call. Request `AbortSignal` is propagated internally; `CANCELLED` is persisted only after an abort is observed, and durable cross-request cancellation is deferred.

Tool results have separate model observations and persisted safe summaries. Observations are bounded, escaped, and marked untrusted in the next prompt. Steps persist only externally relevant decision types, tool names, counts, durations, and safe error codes. The runner does not request or persist chain-of-thought.

## Local embeddings and RAG

The live `nomic-embed-text` model was queried through Ollama `/api/embed` and returned exactly 768 values. `OLLAMA_EMBEDDING_DIMENSION=768` is explicit configuration, `vector(768)` is the database type, and `OllamaEmbeddingProvider` rejects any response with another dimension. It does not infer, truncate, or pad vectors.

Knowledge documents are manual text owned by one workspace and brand. Indexing hashes content, chunks it deterministically, embeds all chunks, replaces old chunks transactionally, and marks the document `READY` or `FAILED`. Unchanged READY documents are not re-embedded.

Retrieval performs vector cosine similarity in PostgreSQL with workspace, brand, and READY filters in the SQL `WHERE` clause. Results contain source metadata and similarity only; embeddings never leave the server.

RAG is opt-in through `useBrandContext: true`. The prompt separates trusted structured brand data from `<untrusted_knowledge>` retrieved text and places the user request in a separate section. Retrieved documents are data, not system instructions.

The local verification flow makes a real embedding request, derives the live finite-vector dimension, compares it to PostgreSQL, then runs guarded pgvector retrieval and RAG generation checks against the existing services.

## Milestone 6 workflow execution

AI_GENERATE resolves a bounded workflow expression into a prompt, calls prepareGeneration and generateText through LLMProvider, and propagates the workflow AbortSignal. AGENT resolves the current workspace-owned agent through the existing AgentRunner and persists only its subordinate AgentRun ID plus a workflow-owned bounded final output.

Workflow AI outputs are durable values, not merely audit metadata. Model name, duration, output length, and safe error codes are stored separately. Prompts, raw responses beyond the bounded output, hidden reasoning, tool observations, and credentials are not persisted in workflow history. Provider and Agent failures default to non-retryable; timeouts are not automatically retried.

## Milestone 7 scheduled workflow execution

Scheduled workflows reuse the existing workflow snapshot, outbox, BullMQ, worker, LLMProvider, BrandContext/RAG, and controlled AgentRunner paths. The scheduler only performs short PostgreSQL transactions and never calls a model. A workspace automation principal supplies verified workspace/schedule scope; it does not create a user, and generation/agent audit identity fields remain nullable.

The scheduler supports five-field CRON, bounded INTERVAL, and terminal ONE_TIME schedules. PostgreSQL occurrence uniqueness and deterministic workflow idempotency prevent duplicate logical runs when schedulers overlap or restart. SKIP and FIRE_ONCE misfires are bounded by the configured grace window.

## Milestone 8 secure webhook workflow execution

Webhook-triggered AI and Agent steps use the same path. An authenticated webhook payload is bounded workflow input only; it cannot select a provider, model, endpoint, agent, tool, brand, workspace, or user. After PostgreSQL event/run/outbox commit, the existing worker resolves the webhook automation origin and invokes the static workflow registry. AI calls remain behind `LLMProvider`, RAG remains workspace/brand filtered, and agent calls remain behind the controlled AgentRunner.

## Milestone 9 human approval gates

The static `APPROVAL` workflow step is a human control boundary, not an AI capability. AI_GENERATE and AgentRunner can produce preceding bounded outputs, but neither can emit a decision or call the approval APIs. The executor returns a typed waiting control result; PostgreSQL creates the request and releases the worker lease.

Approval context contains only safe operational projections. Raw prompts, model responses beyond existing bounded workflow output, RAG text, hidden reasoning, tool observations, webhook bodies, credentials, and secrets are not copied into the inbox. Approval resumes the existing immutable workflow snapshot through the same outbox/worker path; it does not re-run completed AI or agent steps. LLMProvider, BrandContext/RAG, static AgentRunner, and workspace automation principals remain unchanged and cannot bypass the human decision boundary.

## Milestone 7 limitations

There is no external file import, agent memory, critic, multi-agent orchestration, visual workflow canvas, outbound integration, OAuth, or billing in this milestone. Webhooks remain limited to the inbound HMAC protocol, and M9 approvals remain internal authenticated workspace decisions; outbound external actions and external approval channels remain deferred.
