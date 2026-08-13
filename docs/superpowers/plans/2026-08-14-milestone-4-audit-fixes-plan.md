# Milestone 4 Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the confirmed Milestone 4 audit findings while preserving Milestone 3 behavior and avoiding any Milestone 5 functionality.

**Architecture:** Keep the existing modular monolith, `LLMProvider` abstraction, synchronous knowledge indexing, PostgreSQL pgvector storage, and protected route boundaries. Apply narrow fixes at the prompt, indexing, service, route, UI, test, and verification-script boundaries.

**Tech Stack:** Next.js 15, TypeScript strict mode, Drizzle ORM, PostgreSQL 16 with pgvector, Ollama, Zod, Vitest, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-08-14-milestone-4-brand-intelligence-rag-design.md`

## Global Constraints

- Implement Milestone 4 audit fixes only; do not implement Milestone 5 behavior.
- Preserve the exact Milestone 3 non-RAG prompt and generation path when `useBrandContext` is false.
- Keep indexing synchronous; do not add queues, BullMQ, agents, tools, workflows, scheduling, webhooks, approvals, or integrations.
- Do not delete/reset PostgreSQL, Redis, or Ollama volumes or database data.
- Keep the verified `nomic-embed-text` dimension at exactly `768`.
- Do not upgrade unrelated dependencies or run `npm audit fix --force`.
- Do not commit until all available code, test, build, Docker, migration, and runtime checks pass.

---

### Task 1: Prompt boundaries and Milestone 3 compatibility

**Files:**
- Modify: `lib/ai/prompt.ts`
- Test: `tests/prompt-injection.test.ts`
- Test: `tests/ai-prompt.test.ts`
- Test: `tests/rag-generation.test.ts`

- [ ] **Step 1: Add a delimiter-breaking prompt-injection test**

Assert that title, source name, and content containing `</untrusted_knowledge>` are encoded and cannot create an additional closing boundary or untrusted-looking instruction section.

- [ ] **Step 2: Add exact non-RAG compatibility assertions**

Assert that `buildPrompt` with no RAG context keeps an empty system prompt, starts with `User instructions:`, and retains the Milestone 3 structured `Brand context:` format.

- [ ] **Step 3: Run the focused prompt tests and confirm the new assertions fail**

Run `npm.cmd test -- --run tests/prompt-injection.test.ts tests/ai-prompt.test.ts tests/rag-generation.test.ts`.

- [ ] **Step 4: Implement minimal prompt branching and escaping**

Keep the old prompt construction unchanged unless explicitly requested RAG context is present. Encode all retrieved title, source name, and content before placing them inside the untrusted section.

- [ ] **Step 5: Run the focused prompt tests and verify they pass**

Run the same focused command and confirm zero failures.

### Task 2: Concurrency-safe indexing and metadata consistency

**Files:**
- Modify: `lib/knowledge/indexing.ts`
- Modify: `lib/knowledge/service.ts`
- Test: `tests/knowledge-indexing.test.ts`
- Test: `tests/knowledge-service.test.ts`

- [ ] **Step 1: Add tests for stale indexing results**

Model an older operation completing after a newer content version and assert it cannot mark the document `READY` or replace the newer chunks. Add a failed older operation case that cannot overwrite newer success.

- [ ] **Step 2: Add metadata/source invalidation tests**

Assert that changing metadata, source type, or source name marks an indexed document `PENDING` and clears the content hash or otherwise explicitly requires reindexing.

- [ ] **Step 3: Run focused tests and confirm the new cases fail**

Run `npm.cmd test -- --run tests/knowledge-indexing.test.ts tests/knowledge-service.test.ts`.

- [ ] **Step 4: Implement optimistic document-version protection**

Capture the document version/content hash before embedding, condition status transitions and final updates on the expected version/content, and ensure failed stale operations cannot overwrite a newer state. Keep replacement in one transaction.

- [ ] **Step 5: Invalidate indexed metadata fields on update**

When metadata, source type, or source name changes, mark the document pending and clear its content hash so the existing synchronous reindex flow is required.

- [ ] **Step 6: Run focused indexing/service tests and verify they pass**

Run the same focused command and inspect the assertions for real state behavior rather than only mock call counts.

### Task 3: Typed embedding errors and deterministic ordering

**Files:**
- Modify: `lib/security/errors.ts`
- Modify: `lib/knowledge/brand-context.ts`
- Modify: `lib/knowledge/retrieval.ts`
- Modify: `app/api/knowledge/[id]/reindex/route.ts`
- Modify: `app/api/knowledge/retrieve/route.ts`
- Test: `tests/knowledge-routes.test.ts`
- Test: `tests/brand-context.test.ts`
- Test: `tests/knowledge-retrieval.test.ts`

- [ ] **Step 1: Add route tests for every typed embedding failure family**

Assert safe stable responses for provider unavailable, timeout, model unavailable, malformed response, and dimension mismatch without exposing internal details.

- [ ] **Step 2: Add deterministic ordering assertions**

Assert stable ordering for rules/examples and a vector-distance tie-breaker.

- [ ] **Step 3: Run focused route/context/retrieval tests and confirm failures**

Run `npm.cmd test -- --run tests/knowledge-routes.test.ts tests/brand-context.test.ts tests/knowledge-retrieval.test.ts`.

- [ ] **Step 4: Implement centralized safe EmbeddingError mapping**

Map unavailable/timeout to `503`, provider/model/malformed/dimension failures to safe `502` responses as appropriate, without returning provider messages or configuration details.

- [ ] **Step 5: Add stable SQL ordering**

Order brand rules/examples by stable timestamp and ID fields, and order retrieval by cosine distance followed by stable key.

- [ ] **Step 6: Run focused tests and verify they pass**

Run the same focused command and confirm stable response codes, messages, and ordering.

### Task 4: Knowledge UI 204 handling

**Files:**
- Modify: `components/forms/knowledge-panel.tsx`
- Test: `tests/knowledge-panel.test.tsx` or an equivalent focused client-contract test if the current test environment cannot render components.

- [ ] **Step 1: Add a regression test for a successful 204 delete response**

Assert that the response reader does not parse an empty body and that the document list refreshes.

- [ ] **Step 2: Run the focused UI test and confirm the failure**

Run the available focused test command and record any environment limitation precisely.

- [ ] **Step 3: Handle 204 without JSON parsing**

Return an empty success value for `204 No Content`, preserving JSON parsing for other responses.

- [ ] **Step 4: Run the UI test/build checks and verify the delete path**

Run the focused test if supported, then rely on typecheck, lint, build, and the client contract assertion.

### Task 5: Security, isolation, streaming, and integration test strengthening

**Files:**
- Modify: `tests/knowledge-retrieval.test.ts`
- Modify: `tests/knowledge.integration.test.ts`
- Modify: `tests/rag-generation.test.ts`
- Modify: `tests/knowledge-routes.test.ts`
- Create or modify: `tests/knowledge-panel.test.tsx`

- [ ] **Step 1: Strengthen retrieval assertions**

Inspect generated SQL or execute real PostgreSQL queries to prove workspace, brand, and READY predicates; test cross-workspace and cross-brand denial.

- [ ] **Step 2: Add RAG streaming coverage**

Exercise the same prepared RAG request through `streamText` and assert retrieved knowledge remains delimited and generation completes.

- [ ] **Step 3: Add real integration assertions where runtime is available**

Use the existing guarded integration tests with the live embedding model and existing PostgreSQL data without resetting volumes.

- [ ] **Step 4: Run focused tests, then the full suite**

Run focused tests first, then `npm.cmd test -- --run`.

### Task 6: Verification script and runtime/migration verification

**Files:**
- Modify: `scripts/verify-local.ps1`
- Modify: `README.md`
- Modify: `SETUP.md`
- Modify: `AI.md`

- [ ] **Step 1: Extend local verification with real embedding checks**

Verify the live `nomic-embed-text` response has exactly 768 finite values.

- [ ] **Step 2: Add real pgvector and RAG checks to the documented flow**

Run guarded integration checks for insertion, SQL-scoped retrieval, BrandContext, and `llama3.2:3b` generation.

- [ ] **Step 3: Start existing Docker services without deleting volumes**

Run `docker compose up -d` and `docker compose ps`.

- [ ] **Step 4: Apply and inspect the existing database migration**

Run the migration against the existing database and verify the extension, tables, 768-dimensional vector column, HNSW cosine index, foreign keys, constraints, and preservation of Milestones 1–3 tables/data.

- [ ] **Step 5: Verify migration on a temporary clean database**

Use a temporary database only; do not modify or reset the existing Flowyn database or volumes.

- [ ] **Step 6: Run the complete verification sequence**

Run typecheck, lint, full tests, build, `verify-local.ps1`, health checks, real embedding, retrieval, workspace/brand isolation, RAG, streaming, structured output, and Milestone 3 compatibility checks.

- [ ] **Step 7: Review scope and leave uncommitted if any gate fails**

Inspect `git status`, `git diff`, dependency files, migration artifacts, and Milestone 5 scope. Commit only if every required gate passes.
