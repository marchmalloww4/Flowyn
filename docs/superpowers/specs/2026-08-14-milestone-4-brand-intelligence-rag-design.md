# Milestone 4 Brand Intelligence and Local RAG Design

## Scope

Milestone 4 adds workspace- and brand-scoped knowledge storage, deterministic chunking, local Ollama embeddings, PostgreSQL pgvector storage, semantic retrieval, hybrid brand context, protected knowledge APIs, and a small knowledge-management UI. Milestones 1–3 remain intact. Agents, tools, workflows, queues, scheduling, webhooks, approvals, integrations, and billing remain out of scope.

## Verified runtime facts

- Ollama is the existing local provider at the configured `OLLAMA_BASE_URL`.
- `nomic-embed-text` was installed in the existing Ollama volume for verification.
- A live `POST /api/embed` probe returned a vector with exactly 768 elements.
- The schema will therefore use `vector(768)` for this verified configuration.
- The embedding provider will validate every returned vector against the configured `OLLAMA_EMBEDDING_DIMENSION=768` and raise a typed dimension-mismatch error if the model or configuration changes.

Changing to an embedding model with another dimension requires changing the explicit dimension configuration and applying a deliberate database migration; the application will not silently coerce or truncate vectors.

## Architecture

### PostgreSQL and pgvector

The existing PostgreSQL service keeps its named volume and database URL but uses a pgvector-capable PostgreSQL 16 image. A Drizzle migration runs `CREATE EXTENSION IF NOT EXISTS vector` before creating vector-backed tables. The migration uses a fixed `vector(768)` column consistent with the verified model response and creates a cosine HNSW index supported by the selected pgvector image.

### Knowledge documents and chunks

`knowledge_documents` stores a manual knowledge item owned by one workspace and brand. It includes title, source type/name, content, sanitized metadata, content hash, indexing status, and timestamps. `knowledge_chunks` stores workspace ID, brand ID, document ID, deterministic chunk key/index, content, sanitized metadata, and the validated embedding.

Document indexing is synchronous for this milestone because queues are out of scope:

```text
validate -> hash -> deterministic chunk -> embed batch -> replace document chunks -> READY
                                                        \-> FAILED
```

Unchanged READY documents are not embedded again. Re-indexing replaces all chunks for the document in one database transaction, preventing uncontrolled duplicate chunks. Chunk keys include the document ID, chunk index, and chunk content hash, so the same input produces stable identifiers.

### Embedding provider

`EmbeddingProvider` exposes:

```ts
embedText(text: string): Promise<number[]>;
embedDocuments(texts: string[]): Promise<number[][]>;
```

`OllamaEmbeddingProvider` uses the trusted server-side base URL, the configured embedding model, request timeout, and the Ollama `/api/embed` endpoint. It validates non-empty input, model availability, response shape, finite numeric values, and the verified dimension. Provider unavailable, model unavailable, timeout, malformed response, invalid input, and dimension mismatch are represented by typed errors.

### Retrieval

Retrieval embeds the query, then performs a SQL cosine-distance query with `workspace_id`, `brand_id`, and READY-document conditions in the database `WHERE` clause before ordering and limiting results. The application never retrieves globally and filters afterward. Embeddings are not returned to clients.

### Brand context and RAG

`BrandContext` loads the authorized brand, voice profile, rules, examples, and optionally bounded semantic chunks. Retrieved content is explicitly marked as untrusted reference data and delimited from trusted application instructions and the user request. Prompt construction uses a maximum chunk count and maximum context character budget.

Existing generation behavior remains compatible:

- `useBrandContext` defaults to `false`.
- Existing `brandId` usage still supports structured brand context.
- `useBrandContext: true` requires an authorized `brandId` and adds bounded semantic knowledge.

## Protected APIs

- `GET/POST /api/knowledge`
- `GET/PATCH/DELETE /api/knowledge/:id`
- `POST /api/knowledge/:id/reindex`
- `POST /api/knowledge/retrieve`
- `POST /api/ai/generate` extended with `useBrandContext`

Every route authenticates, validates with Zod, resolves the brand server-side, checks workspace membership, applies role-aware brand authorization, and returns non-leaking resource errors. Workspace and brand IDs supplied by clients are never treated as proof of access.

## UI

The dashboard gains a focused Knowledge panel for selecting a brand, adding manual knowledge, viewing indexing status, editing, deleting, and re-indexing. External file imports and full document-management features are excluded.

## Testing and verification

Tests cover the chunker, metadata sanitization, provider success/error/dimension behavior, schema contracts, CRUD and authorization isolation, re-index replacement, SQL retrieval filters/top-K, BrandContext boundaries, prompt-injection content handling, and RAG generation. A guarded integration test uses the live `nomic-embed-text` model and actual pgvector insertion/retrieval. Runtime verification also exercises real Ollama generation, embedding, vector insertion, semantic retrieval, and RAG generation without resetting volumes or database data.
