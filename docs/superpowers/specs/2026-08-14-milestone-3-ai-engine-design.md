# Flowyn Milestone 3 AI Engine Design

## Scope

Milestone 3 strengthens the existing local Ollama generation path into a provider-agnostic AI engine. It includes typed provider contracts, trusted AI configuration, reusable prompt construction, schema-validated structured output, real Ollama streaming, safe typed errors, workspace-scoped generation logging, a protected generation API, and a small UI update that exercises workspace/brand context and streaming.

It does not implement RAG, embeddings, pgvector, document ingestion, vector retrieval, agent loops, agent memory, planning, tools, tool execution, React Flow, workflows, BullMQ, scheduling, webhooks, approvals, integrations, or billing.

The flow is:

`authenticated user -> workspace membership -> optional brand context -> prompt builder -> AIProvider -> Ollama -> safe result/stream -> generation log`

## Provider abstraction

Keep `LLMProvider` as the canonical interface because existing application code and repository guidance use that name. Export `AIProvider` as a type alias for discoverability without creating a second contract.

The interface provides:

- `generate(input): Promise<LLMResult>` for complete text responses.
- `generateStructured(input): Promise<LLMStructuredResult<T>>` for JSON parsing followed by Zod validation.
- `stream(input): AsyncIterable<LLMStreamChunk>` for provider-native incremental output.
- `health(): Promise<LLMHealthResult>` for provider and configured-model readiness.

The provider receives trusted server-side configuration. User requests may choose bounded generation options, but never a model endpoint URL or arbitrary provider implementation. The current provider factory supports `AI_PROVIDER=ollama`; the interface leaves room for future providers without domain code importing Ollama.

## Configuration and errors

Add `AI_PROVIDER`, `AI_TEMPERATURE`, and `AI_MAX_OUTPUT_TOKENS` to the environment schema alongside the existing Ollama URL/model, timeout, and prompt limit settings. `getAIConfig()` returns a normalized immutable configuration object with the provider, model, temperature, max output tokens, timeout, and prompt limit.

Use an `AIError` hierarchy with safe messages and stable codes:

- `PROVIDER_UNAVAILABLE`
- `MODEL_UNAVAILABLE`
- `REQUEST_TIMEOUT`
- `INVALID_REQUEST`
- `GENERATION_FAILED`
- `INVALID_STRUCTURED_OUTPUT`

Route handlers serialize only these safe codes/messages. Raw URLs, stack traces, response bodies, secrets, and environment values never cross the API boundary.

## Prompt engine and brand context

`lib/ai/prompt.ts` owns prompt composition. It accepts system instructions, user instructions, optional plain context, optional structured brand context, and output requirements, and returns the final system/user strings plus the total character count.

The generation service requires a `workspaceId` and authenticated user ID. It verifies membership before building a prompt. An optional `brandId` is loaded through the existing authorized brand service and must belong to the requested workspace; otherwise the service returns a non-leaking not-found response. Brand context contains only safe brand fields and is formatted by the prompt builder, never assembled in the route handler.

## Ollama behavior

`OllamaProvider` keeps the configured base URL and model private to server configuration. Before generation it verifies the configured model through `/api/tags`, then calls `/api/generate` with `stream:false` for complete responses or `stream:true` for native NDJSON streaming. It parses and validates response shapes, maps connection/timeout/model/HTTP/malformed-response failures to `AIError`, and never returns raw Ollama errors.

Structured generation requests Ollama JSON output, parses the returned text with `JSON.parse`, and validates the result with the caller's Zod schema. Markdown or malformed JSON is rejected as `INVALID_STRUCTURED_OUTPUT`; it is never silently repaired or trusted.

Streaming consumes Ollama's actual response body through an async iterator. The API exposes those chunks as Server-Sent Events. The UI appends chunks as they arrive. No completed response is split or relabeled as streaming.

## Generation logging

Add a `generation_logs` table with workspace and nullable user foreign keys, provider, model, status, duration, input/output character counts, safe error code, and creation timestamp. Prompts and responses are not stored by default. Successful and failed generation attempts are logged best-effort after the provider operation; logging failures do not replace the user-facing AI result.

## API and UI

`POST /api/ai/generate` requires authentication and a UUID `workspaceId`. It accepts a prompt, optional brand ID, bounded temperature/max-token overrides, and a `stream` flag. It calls the generation service and returns either a typed JSON result or an SSE stream with `{text, done, model}` events and a terminal `[DONE]` event.

The dashboard AI panel loads the user's workspaces and brands, submits the selected workspace/brand context, displays loading/error/success states, and consumes the real SSE stream. It remains a focused generation panel and does not become a content editor or workflow UI.

## Verification

Tests cover provider contracts, model-unavailable/network/timeout/malformed response errors, structured validation, prompt limits, workspace authorization, generation logging, and SSE behavior. A local-only integration test performs a real generation against Ollama when `RUN_OLLAMA_INTEGRATION=1`; it is skipped by default so the ordinary suite never depends on external services. Runtime verification also performs an authenticated real generation request through the application API and reruns all Milestone 1/2 regression tests.
