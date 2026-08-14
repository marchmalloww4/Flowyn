# Milestone 10 Visual Workflow Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Add a server-validated visual editor that round-trips the existing workflow definition, persists isolated visual layout, prevents stale saves, and preserves all M1–M9 runtime boundaries.

**Architecture:** Keep `WorkflowDefinition` as the only executable representation. Add pure definition/editor projection utilities, a metadata-only current-layout record, transactional `currentVersionId` concurrency, and a controlled `@xyflow/react` client UI that calls the existing workflow API.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.8, Zod, Drizzle/PostgreSQL, Tailwind/shadcn primitives, Vitest, and one pinned `@xyflow/react` dependency.

**Spec:** `docs/superpowers/specs/2026-08-14-milestone-10-visual-workflow-editor-design.md`

## Global Constraints

- Implement Milestone 10 only; do not implement Milestone 11.
- The executable workflow definition remains the only execution representation.
- Support exactly `SET_VALUE`, `TRANSFORM`, `CONDITION`, `AI_GENERATE`, `AGENT`, and `APPROVAL`.
- Require `expectedVersionId` for executable definition saves and return `WORKFLOW_VERSION_CONFLICT` on stale saves.
- Persist only bounded non-executable layout metadata.
- Preserve Better Auth, centralized workspace authorization, PostgreSQL, Redis/BullMQ, outbox, scheduler, LLMProvider, RAG, AgentRunner, webhooks, and approvals.
- Do not add outbound HTTP, OAuth, external credentials, arbitrary code, shell, SQL, filesystem, browser automation, file uploads, or new orchestration semantics.
- Do not reset PostgreSQL or delete Docker volumes.
- Generate and review migrations through Drizzle.
- Use tests before production code for each behavior.

---

### Task 1: Add pure editor projection contracts

**Files:**
- Create: `lib/workflows/editor.ts`
- Create: `lib/workflows/editor-state.ts`
- Test: `tests/workflow-editor.test.ts`
- Test: `tests/workflow-editor-state.test.ts`
- Modify: `lib/workflows/types.ts`
- Modify: `lib/workflows/registry.ts`

**Interfaces:**
- `deserializeWorkflowDefinition(definition: WorkflowDefinition): WorkflowEditorState`
- `serializeWorkflowEditorState(state: WorkflowEditorState): WorkflowDefinition`
- `createDefaultWorkflowLayout(definition: WorkflowDefinition): WorkflowEditorLayout`
- `workflowStepTypes`: the single six-type tuple used by registry/editor metadata.
- `workflowEditorReducer(state, action): WorkflowEditorState`

- [ ] Write failing tests for all six step types, stable IDs, normal edges, condition true/false edges, terminal steps, invalid duplicate IDs, invalid handles, unsupported types, and definition/canvas round trips.
- [ ] Run `npm.cmd test -- --run tests/workflow-editor.test.ts tests/workflow-editor-state.test.ts` and confirm the failures are caused by missing editor contracts.
- [ ] Implement pure editor types and deterministic deserialize/serialize functions without importing React or canvas libraries.
- [ ] Implement reducer actions for select, add, update, connect, remove, dirty, save success, save failure, and version conflict while preserving unsaved state.
- [ ] Reuse one six-type constant from the workflow type layer so the static registry and editor cannot drift.
- [ ] Run the focused tests and the existing workflow graph/validation tests.

### Task 2: Add bounded layout validation and schema tests

**Files:**
- Create: `lib/workflows/editor-layout.ts`
- Test: `tests/workflow-editor-layout.test.ts`
- Modify: `lib/database/schema.ts`
- Test: `tests/workflow-editor-schema.test.ts`

**Interfaces:**
- `workflowEditorLayoutSchema`
- `type WorkflowEditorLayout`
- `parseWorkflowEditorLayout(input: unknown): WorkflowEditorLayout`

- [ ] Write failing tests for bounded node positions, finite viewport values, positive bounded zoom, duplicate layout node IDs, unknown executable fields, oversized layouts, and layout isolation from a definition hash.
- [ ] Run the focused layout/schema tests and confirm failure before schema implementation.
- [ ] Add `workflowEditorLayouts` with `workspaceId`, `workflowId`, `workflowVersionId`, bounded `layout` JSONB, `updatedBy`, and timestamps. Enforce one current row per workflow and foreign keys to workspace/workflow/version/user.
- [ ] Add schema tests proving layout is not part of `workflowVersions.definition`, `workflowRuns.definitionSnapshot`, or `definitionHash` inputs.
- [ ] Run focused schema tests and `npm.cmd run typecheck`.

### Task 3: Generate and review the metadata-only migration

**Files:**
- Create: generated `db/migrations/0010_*.sql`
- Create: generated `db/migrations/meta/0010_snapshot.json`
- Modify: generated migration journal

- [ ] Run `npm.cmd run db:generate` after reviewing the Drizzle schema diff.
- [ ] Inspect the generated SQL and verify it creates only the layout metadata table/indexes/constraints and does not alter executable workflow tables.
- [ ] Run the focused schema tests against the generated metadata.
- [ ] Apply the migration to the existing PostgreSQL database with `docker compose exec -T app npm run db:migrate` without resetting data.
- [ ] Record the migration for later clean-database verification.

### Task 4: Add editor projection and transactional optimistic concurrency

**Files:**
- Modify: `lib/workflows/service.ts`
- Modify: `lib/workflows/validation.ts`
- Modify: `lib/security/errors.ts` only if a safe typed conflict helper is needed
- Test: `tests/workflow-editor-service.test.ts`
- Test: `tests/workflow-concurrency.test.ts`

**Interfaces:**
- `getWorkflowEditorProjection(userId, workflowId, db)` returns metadata, current definition, current version ID/number, and compatible layout.
- `workflowPatchSchema` accepts `expectedVersionId` and optional layout metadata.
- `updateWorkflow` locks the workflow row, checks `expectedVersionId`, validates resources, creates the immutable version, and updates current layout atomically.

- [ ] Write failing tests for current-definition projection, compatible layout, mismatched layout fallback, required expected version on definition changes, stale conflict, first-writer-wins concurrent saves, layout-only save, and preservation of metadata-only updates.
- [ ] Run the focused service/concurrency tests and confirm expected failures.
- [ ] Implement the editor projection through the existing workflow service and existing route; do not create a parallel editing service.
- [ ] Add transactional `currentVersionId` locking and return `AppError("WORKFLOW_VERSION_CONFLICT", 409, ...)` on mismatch.
- [ ] Persist layout only after version/workflow checks pass. Exclude layout from definition hashing and version JSON.
- [ ] Keep metadata-only updates compatible where they do not change executable definitions.
- [ ] Run focused service/concurrency tests and existing workflow service tests.

### Task 5: Make executable resource validation unconditional on definition saves

**Files:**
- Modify: `lib/workflows/service.ts`
- Test: `tests/workflow-resource-validation.test.ts`
- Test: `tests/workflow-authorization.test.ts`

- [ ] Write failing tests proving disabled workflow definition saves reject cross-workspace, deleted, and inaccessible agent/brand references.
- [ ] Write failing tests proving enabling/running still applies enabled-agent usability checks.
- [ ] Run the focused tests and confirm the current conditional validation behavior fails them.
- [ ] Validate workspace ownership/existence for every executable definition save, regardless of enabled state.
- [ ] Retain stronger enabled/usable checks for enabling and running.
- [ ] Preserve non-leaking resource errors and existing principal-specific validation.
- [ ] Run focused resource tests plus existing agent, brand, workflow, schedule, webhook, and approval tests.

### Task 6: Extend existing workflow routes and add route tests

**Files:**
- Modify: `app/api/workflows/[id]/route.ts`
- Modify: `tests/workflow-routes.test.ts`
- Create: `tests/workflow-editor-routes.test.ts`

- [ ] Write failing route tests for authorized editor projection, definition save with expected version, malformed layout, stale conflict, and raw JSON-equivalent PATCH.
- [ ] Run the route tests and confirm missing projection/concurrency behavior.
- [ ] Make `GET /api/workflows/:id` return the editor projection through the existing route.
- [ ] Keep `PATCH /api/workflows/:id` as the authoritative save path with strict Zod parsing.
- [ ] Do not add an execution or editor-specific parallel API.
- [ ] Run route tests and existing protected-route tests.

### Task 7: Verify and install the one approved canvas dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` if present

- [ ] Inspect the repository’s exact React, Next.js, TypeScript, and package-manager versions.
- [ ] Query the selected stable `@xyflow/react` package metadata and peer requirements without modifying files.
- [ ] Verify React 19, Next.js 15, TypeScript 5.8, and the package’s peer requirements are compatible.
- [ ] Install only the pinned `@xyflow/react` version if compatibility is good.
- [ ] Confirm no second graph/canvas dependency and no unrelated dependency upgrades.
- [ ] Run `npm.cmd run typecheck` immediately after installation.

### Task 8: Implement the visual editor UI

**Files:**
- Create: `components/forms/workflow-editor.tsx`
- Create: `components/workflow-editor/workflow-canvas.tsx`
- Create: `components/workflow-editor/workflow-node.tsx`
- Create: `components/workflow-editor/workflow-step-palette.tsx`
- Create: `components/workflow-editor/workflow-config-panel.tsx`
- Create: `components/workflow-editor/workflow-json-editor.tsx`
- Modify: `components/forms/workflow-panel.tsx`
- Modify: dashboard presentation files only as needed

- [ ] Add reducer/state tests first for add/select/connect/configure/delete, dirty-state preservation, malformed JSON, save failure, stale conflict, and reload/discard behavior.
- [ ] Run the focused state/UI helper tests and confirm failures before component implementation.
- [ ] Implement controlled `@xyflow/react` nodes/edges using pure editor state adapters.
- [ ] Render only the six supported types with accessible labels and distinct approval styling.
- [ ] Add palette, node selection, type-specific configuration panels, validation summary, save status, run action, and Advanced JSON mode.
- [ ] Keep schedules/webhooks as resource badges or separate panels, not canvas nodes.
- [ ] Preserve unsaved state after save errors and conflicts.
- [ ] Render unrenderable definitions in read-only JSON fallback without mutation.
- [ ] Run focused state/UI tests and build the app.

### Task 9: Add end-to-end M10 integration coverage

**Files:**
- Create: `tests/workflow-editor.integration.test.ts`
- Modify: `scripts/verify-local.ps1`

- [ ] Write guarded integration tests for existing definition rendering, visual round-trip, layout persistence/isolation, stale saves, concurrent saves, cross-workspace resources, JSON/canvas equivalence, and immutable run snapshots.
- [ ] Run the guarded integration suite before wiring all runtime pieces and confirm expected failures where behavior is absent.
- [ ] Implement the smallest integration helpers using the existing PostgreSQL/Redis test conventions.
- [ ] Assert layout changes never alter `definitionHash`, version definition, run snapshot, execution status, schedule, webhook, or approval behavior.
- [ ] Add schema/layout/concurrency/editor integration checks to `verify-local.ps1` without removing M1–M9 checks.
- [ ] Run the guarded integration suite against the existing development database.

### Task 10: Documentation and security review

**Files:**
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `SECURITY.md`
- Modify: `SETUP.md`
- Modify: `AI.md` only if M10 boundaries need documentation

- [ ] Document the visual editor as an authoring projection, six supported steps, Advanced JSON mode, layout isolation, and optimistic conflict behavior.
- [ ] Document that schedules and webhooks remain external workflow resources.
- [ ] Review for client-controlled authorization, layout executable leakage, unsupported step creation, XSS, dynamic execution, cross-workspace references, concurrency bypass, server-validation bypass, raw JSON bypass, secret exposure, and accidental outbound network capability.
- [ ] Scan production code for `eval`, `Function`, dynamic modules, shell, arbitrary SQL, filesystem access, and new external HTTP introduced by M10.
- [ ] Confirm M11 exclusions remain explicit.

### Task 11: Full verification, clean database verification, and local commit

**Files:**
- All verified M10 files

- [ ] Run `npm.cmd run typecheck`.
- [ ] Run `npm.cmd run lint`.
- [ ] Run `npm.cmd test -- --run`.
- [ ] Run `npm.cmd run build`.
- [ ] Run `docker compose config`.
- [ ] Run `docker compose up -d --build`.
- [ ] Run `docker compose ps` and confirm app, worker, scheduler, PostgreSQL, Redis, and Ollama remain running/healthy.
- [ ] Run the migration against a temporary clean database and verify the existing migration path remains valid.
- [ ] Run `./scripts/verify-local.ps1` and require its M10 success result.
- [ ] Run `git diff --check` and inspect the complete diff/security surface.
- [ ] Stage and commit locally with `feat: add server-validated visual workflow editor`.
- [ ] Verify clean status and commit contents.
- [ ] Do not push and do not start Milestone 11.

---

## Verification matrix

The final verification must demonstrate:

- Definition/canvas serialization, round-trip, determinism, all six types, condition handles, invalid graph rejection, layout isolation, and UI state behavior.
- Transactional `expectedVersionId` conflict handling and real concurrent save behavior.
- Resource validation, authorization, workspace isolation, JSON/canvas equivalence, and non-leaking errors.
- Existing AI, RAG, agent, workflow, scheduling, webhook, approval, worker, migration, Docker, and health behavior.

The plan intentionally excludes all M11 capabilities and all new external trust boundaries.
