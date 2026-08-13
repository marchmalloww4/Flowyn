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

The agent and workflow milestones will consume this interface, not Ollama directly.

## Local embeddings and RAG

The live `nomic-embed-text` model was queried through Ollama `/api/embed` and returned exactly 768 values. `OLLAMA_EMBEDDING_DIMENSION=768` is explicit configuration, `vector(768)` is the database type, and `OllamaEmbeddingProvider` rejects any response with another dimension. It does not infer, truncate, or pad vectors.

Knowledge documents are manual text owned by one workspace and brand. Indexing hashes content, chunks it deterministically, embeds all chunks, replaces old chunks transactionally, and marks the document `READY` or `FAILED`. Unchanged READY documents are not re-embedded.

Retrieval performs vector cosine similarity in PostgreSQL with workspace, brand, and READY filters in the SQL `WHERE` clause. Results contain source metadata and similarity only; embeddings never leave the server.

RAG is opt-in through `useBrandContext: true`. The prompt separates trusted structured brand data from `<untrusted_knowledge>` retrieved text and places the user request in a separate section. Retrieved documents are data, not system instructions.

The local verification flow makes a real embedding request, asserts the verified 768-dimensional finite vector, then runs guarded pgvector retrieval and RAG generation checks against the existing services.

## Milestone 4 limitations

There is no external file import, autonomous agent loop, tool execution, memory, critic, workflow node execution, queue, scheduling, webhook, approval, integration, billing, or editor surface in this milestone. Knowledge input is manual text and indexing is synchronous.
