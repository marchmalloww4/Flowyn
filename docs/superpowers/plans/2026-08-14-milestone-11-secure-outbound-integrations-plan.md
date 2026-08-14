# Milestone 11 Secure Outbound Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task with review checkpoints.

**Goal:** Add a workspace-isolated credential vault, one static Slack `post_message` connector, a policy-driven `INTEGRATION_ACTION` workflow step, and durable safe handling of external side effects without adding generic HTTP capability.

**Architecture:** Keep Better Auth, centralized workspace authorization, PostgreSQL/Drizzle, Redis/BullMQ, the transactional outbox, the existing workflow worker, approval gates, LLMProvider, RAG, AgentRunner, and visual editor authoritative. Add a static integration registry, a purpose-aware integration SecretBox keyring that preserves webhook ciphertext compatibility, a fixed Slack egress adapter, and PostgreSQL action state keyed by immutable workflow run/step identity.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.8, Zod, Drizzle/PostgreSQL, Redis/BullMQ, native Node `fetch` behind a static target adapter, Tailwind/shadcn UI, Vitest, and existing Docker Compose services.

**Spec:** `docs/superpowers/specs/2026-08-14-milestone-11-secure-outbound-integrations-design.md`

## Global Constraints

- Implement Milestone 11 only; do not start Milestone 12.
- Slack `post_message` is the only reference connector and operation in M11.
- Do not implement OAuth, generic HTTP, arbitrary URLs, arbitrary methods, arbitrary headers, arbitrary ports, redirects, curl, browser automation, dynamic connector code, or user-written plugins.
- `slack.post_message.requiresApproval` is `true`; approval enforcement must remain operation-policy driven rather than globally hard-coded.
- The workflow validator must prove that every reachable path to an approval-required integration operation crosses an `APPROVAL` step.
- Approval preview data must be bounded workflow data only; it must contain no credentials, hidden reasoning, authorization headers, or full provider responses.
- Preserve complete M8 webhook ciphertext compatibility; do not silently rewrite existing webhook encryption.
- `INTEGRATION_EGRESS_ENABLED` defaults to `false` and real egress is fail-closed when disabled.
- Slack timeout, post-dispatch connection loss, unknown 5xx, provider-call-boundary crash, and unproven success become `AMBIGUOUS` and never automatically retry.
- Do not claim exactly-once external execution.
- Workflow snapshots store credential IDs only; plaintext/ciphertext secrets never enter definitions, versions, inputs, outputs, queues, prompts, agent history, audit metadata, logs, or errors.
- Agents may produce bounded workflow data but AgentRunner must not receive Slack or integration tools.
- Reuse the existing workflow worker, queue, outbox, leases, retries, cancellation, audit, and error abstractions.
- Do not reset PostgreSQL, delete Docker volumes, or alter existing M1-M10 migrations.
- Generate and review migrations with Drizzle; do not hand-edit generated migration metadata.
- Add focused tests before production code for every security, provider, authorization, state-machine, and recovery behavior.
- Do not upgrade unrelated dependencies.

## Repository map and file ownership

Create the following focused integration modules:

- `lib/integrations/types.ts` — connector, credential, catalog, egress, and action-state contracts.
- `lib/integrations/policy.ts` — bounds, status values, timeout/size limits, and retry classification constants.
- `lib/integrations/validation.ts` — credential, Slack operation, API, and integration-step Zod schemas.
- `lib/integrations/registry.ts` — static Slack connector catalog and operation lookup.
- `lib/integrations/egress.ts` — fixed-target bounded transport with no caller-supplied URL.
- `lib/integrations/slack.ts` — Slack request/response adapter for `post_message` only.
- `lib/integrations/repository.ts` — workspace-scoped credential and action-row persistence helpers.
- `lib/integrations/credentials.ts` — credential lifecycle service, SecretBox use, authorization, and safe projections.
- `lib/integrations/actions.ts` — durable action claim/complete/fail/ambiguous transitions.
- `lib/workflows/executors/integration-action.ts` — existing workflow executor contract adapter.

Modify only the existing architecture seams:

- `lib/security/secrets.ts`, `lib/security/keyring.ts`, and `lib/env.ts` for purpose-aware integration encryption.
- `lib/database/schema.ts` and generated migrations for durable tables and step constraints.
- `lib/authz/authorization.ts` and `lib/audit/service.ts` for centralized policy/events.
- `lib/workflows/types.ts`, `validation.ts`, `graph.ts`, `registry.ts`, `service.ts`, `executor.ts`, `approvals.ts`, and `approval-service.ts` for the new static step and approval preview.
- `app/api/integrations/` and `app/api/integration-credentials/` for authenticated management routes.
- Existing dashboard/editor components for safe credential and step configuration.
- `README.md`, `ARCHITECTURE.md`, `SECURITY.md`, `SETUP.md`, `AI.md`, `.env.example`, `docker-compose.yml`, and `scripts/verify-local.ps1` for operational documentation and guarded verification.

---

### Task 1: Define static connector, credential, egress, and action contracts

**Files:**
- Create: `lib/integrations/types.ts`
- Create: `lib/integrations/policy.ts`
- Create: `lib/integrations/validation.ts`
- Test: `tests/integration-registry.test.ts`
- Test: `tests/integration-validation.test.ts`

**Interfaces:**
- `ConnectorId = "slack"`
- `ConnectorOperationId = "post_message"`
- `IntegrationActionStatus = "PENDING" | "IN_FLIGHT" | "SUCCEEDED" | "FAILED" | "AMBIGUOUS" | "CANCELLED"`
- `SlackPostMessageInput { channel: string; text: string }`
- `SlackPostMessageOutput { provider: "slack"; channel: string; providerMessageId: string }`
- `IntegrationActionConfig { connectorId: "slack"; credentialId: string; operation: "post_message"; input: { channel: WorkflowValueExpression; text: WorkflowValueExpression } }`
- `StaticEgressTarget = "slack.chat.post_message"`
- `SafeIntegrationResult { output: JsonValue; safeMetadata: SafeMetadata; providerRequestId: string | null }`

- [ ] Write failing tests proving the only accepted connector is `slack`, the only accepted operation is `post_message`, and unknown registry identifiers are rejected.
- [ ] Write failing tests proving Slack input rejects missing fields, extra fields, control characters, oversized strings, and non-string resolved values.
- [ ] Write failing tests proving `IntegrationActionConfig` rejects URL, method, header, port, redirect, token, and arbitrary-body properties.
- [ ] Write failing tests proving `requiresApproval` is metadata on the operation definition rather than a global boolean applied to all future steps.
- [ ] Run `npm.cmd test -- --run tests/integration-registry.test.ts tests/integration-validation.test.ts` and confirm failure from missing modules/contracts.
- [ ] Implement the types, bounds, strict Zod schemas, and safe metadata types with no network calls.
- [ ] Run the focused tests and `npm.cmd run typecheck`.
- [ ] Commit the contract/test slice with `feat: add static integration contracts`.

The implementation must not expose a general request type such as `{ url: string; method: string; headers: Record<string, string> }` to workflow or connector configuration. The only transport target type is the closed `StaticEgressTarget` union.

### Task 2: Add the versioned integration SecretBox keyring without changing webhooks

**Files:**
- Create: `lib/security/keyring.ts`
- Modify: `lib/security/secrets.ts`
- Modify: `lib/env.ts`
- Modify: `.env.example`
- Test: `tests/integration-secrets.test.ts`
- Modify: `tests/webhook-secrets.test.ts` only to add compatibility assertions

**Interfaces:**
- `parseSecretKeyring(raw: string): ReadonlyMap<string, Uint8Array>`
- `encryptIntegrationSecret(secret: string, context: IntegrationSecretContext): string`
- `decryptIntegrationSecret(envelope: string, context: IntegrationSecretContext): string`
- `IntegrationSecretContext { keyring; currentKeyVersion; connectorId; credentialId; secretVersion }`
- Existing `generateWebhookSecret`, `encryptWebhookSecret`, and `decryptWebhookSecret` signatures remain compatible.

- [ ] Write failing tests for current-key encryption/decryption, previous-key-version decryption, invalid key length, unknown version, invalid tag, wrong credential ID, wrong connector ID, and wrong secret version.
- [ ] Add regression tests proving existing webhook ciphertext still decrypts with the original webhook context and envelope format.
- [ ] Run `npm.cmd test -- --run tests/integration-secrets.test.ts tests/webhook-secrets.test.ts` and confirm failures before implementation.
- [ ] Implement a separate integration envelope purpose and associated data; do not route webhook ciphertext through the new integration envelope.
- [ ] Parse `INTEGRATION_CREDENTIAL_KEYRING_JSON` as a server-only keyring and require `INTEGRATION_CREDENTIAL_CURRENT_KEY_VERSION` to exist in it.
- [ ] Add `INTEGRATION_EGRESS_ENABLED`, keyring, key version, request timeout, request-size, and response-size settings to `lib/env.ts` with bounded Zod validation.
- [ ] Keep webhook variables and defaults unchanged.
- [ ] Run focused secret tests, `npm.cmd run typecheck`, and `npm.cmd run lint`.
- [ ] Commit with `feat: add versioned integration credential encryption`.

No error from this module may include secret material, ciphertext, key contents, or the raw keyring JSON.

### Task 3: Add credential schema, repository, lifecycle service, authorization, and audit contracts

**Files:**
- Modify: `lib/database/schema.ts`
- Create: `lib/integrations/repository.ts`
- Create: `lib/integrations/credentials.ts`
- Modify: `lib/authz/authorization.ts`
- Modify: `lib/audit/service.ts`
- Test: `tests/integration-credential-schema.test.ts`
- Test: `tests/integration-credential-service.test.ts`
- Test: `tests/integration-authorization.test.ts`

**Interfaces:**
- `IntegrationCredentialSafe`
- `createIntegrationCredential(userId: string, input: CreateIntegrationCredentialInput, db?: Database)`
- `listIntegrationCredentials(userId: string, workspaceId: string, db?: Database)`
- `getIntegrationCredential(userId: string, credentialId: string, db?: Database)`
- `updateIntegrationCredential(userId: string, credentialId: string, input: UpdateIntegrationCredentialInput, db?: Database)`
- `rotateIntegrationCredential(userId: string, credentialId: string, secret: IntegrationSecretMaterial, db?: Database)`
- `revokeIntegrationCredential(userId: string, credentialId: string, db?: Database)`
- `resolveActiveIntegrationCredential(workspaceId: string, credentialId: string, connectorId: ConnectorId, db: Database)`

- [ ] Write failing tests for OWNER/ADMIN creation, MEMBER read-only access, mutation denial, safe list/detail projections, and server-derived workspace authorization.
- [ ] Write failing tests for cross-workspace list/read/rotate/delete attempts and connector mismatch.
- [ ] Write failing tests proving create/rotate responses contain neither plaintext nor ciphertext and audit metadata contains only safe identifiers.
- [ ] Write failing tests for rotation preserving credential ID, incrementing `secretVersion`, and changing the material resolved by future execution.
- [ ] Write failing tests for revocation and soft deletion blocking future execution while preserving historical row identity.
- [ ] Run the focused tests and confirm failure before schema/service implementation.
- [ ] Add `integration_credentials` with workspace, connector, safe metadata, encrypted material, key/secret versions, timestamps, revocation, deletion, and last-use columns.
- [ ] Implement repository queries with workspace predicates on every credential lookup.
- [ ] Implement lifecycle operations using Better Auth user IDs and `requireWorkspaceAction`.
- [ ] Add `integration.read`, `integration.create`, `integration.update`, `integration.delete`, `integration.rotate_secret`, and `integration.execute` to the existing action policy.
- [ ] Add credential management audit actions and pass only safe metadata to `recordAuditEvent`.
- [ ] Run focused tests and the existing authorization/audit tests.
- [ ] Commit with `feat: add workspace integration credential vault`.

The credential service may decrypt only for a trusted execution resolver. Management routes must never call a decrypt function.

### Task 4: Generate and review the credential migration

**Files:**
- Create: generated `db/migrations/0011_*.sql`
- Create: generated `db/migrations/meta/0011_snapshot.json`
- Modify: generated migration journal
- Test: `tests/integration-credential-schema.test.ts`

- [ ] Run `npm.cmd run db:generate` after reviewing the Drizzle schema diff.
- [ ] Inspect the generated SQL for only the credential table, indexes, foreign keys, checks, and migration metadata.
- [ ] Verify the migration does not alter existing webhook ciphertext columns or delete/rename existing tables.
- [ ] Run `npm.cmd run db:migrate` against the existing PostgreSQL service without resetting volumes.
- [ ] Verify existing webhook, workflow, schedule, approval, and editor rows remain present.
- [ ] Apply the full migration chain to a clean temporary PostgreSQL database using the repository migration command.
- [ ] Commit the generated migration with `feat: add integration credential migration`.

### Task 5: Implement the bounded Slack egress and connector adapter

**Files:**
- Create: `lib/integrations/egress.ts`
- Create: `lib/integrations/slack.ts`
- Modify: `lib/integrations/registry.ts`
- Test: `tests/integration-egress.test.ts`
- Test: `tests/slack-connector.test.ts`

**Interfaces:**
- `executeStaticEgress(request: StaticEgressRequest): Promise<StaticEgressResponse>` where `StaticEgressRequest.target` is only `"slack.chat.post_message"`.
- `slackConnectorDefinition`
- `slackPostMessageExecutor.execute(context, input, credential)`
- `classifySlackFailure(responseOrError): ConnectorFailureClassification`

- [ ] Write failing egress tests proving the target maps internally to `https://slack.com/api/chat.postMessage`, uses POST, rejects redirects, enforces timeout and byte limits, checks JSON content type, and never accepts a URL argument.
- [ ] Write failing connector tests proving the request body is exactly bounded `channel` and `text`, the Authorization header is generated server-side, and safe output excludes the response body/token.
- [ ] Write failing tests for Slack success, invalid credential, provider rejection, 429 classification, unknown 5xx classification, timeout, connection loss, malformed JSON, and oversized response.
- [ ] Run focused tests and confirm failure before implementation.
- [ ] Implement the fixed-target transport with injected response behavior for deterministic tests; use native Node fetch only behind this target switch.
- [ ] Set `redirect: "error"`, preserve TLS verification, combine the workflow abort signal with the bounded request timeout, and stream/read no more than the configured response limit.
- [ ] Map only safe provider identifiers and status classes into `SafeIntegrationResult` or typed failures.
- [ ] Treat timeout, post-dispatch connection loss, unknown 5xx, and malformed/unknown success as ambiguous rather than retryable.
- [ ] Keep `INTEGRATION_EGRESS_ENABLED=false` fail-closed for real transport calls.
- [ ] Run focused connector/egress tests and security scans for arbitrary URL/method/header usage.
- [ ] Commit with `feat: add bounded Slack connector egress`.

The Slack implementation must not expose a generic `fetch` helper to workflow configuration or route handlers.

### Task 6: Add durable integration action schema, repository, and migration

**Files:**
- Modify: `lib/database/schema.ts`
- Create: `lib/integrations/actions.ts`
- Test: `tests/integration-action-schema.test.ts`
- Test: `tests/integration-action-state.test.ts`

**Interfaces:**
- `claimIntegrationAction(input: ClaimIntegrationActionInput, db: Database): Promise<IntegrationActionClaim>`
- `completeIntegrationAction(input: CompleteIntegrationActionInput, db: Database): Promise<IntegrationActionRun>`
- `failIntegrationAction(input: FailIntegrationActionInput, db: Database): Promise<IntegrationActionRun>`
- `markStaleIntegrationActionAmbiguous(actionId: string, db: Database): Promise<boolean>`
- `getIntegrationAction(workflowRunId: string, workflowStepId: string, workspaceId: string, db: Database)`

- [ ] Write failing state tests for `PENDING -> IN_FLIGHT`, proven success, safe failure, ambiguous failure, cancellation, duplicate claim, active in-flight conflict, and stale in-flight ambiguity.
- [ ] Write failing tests for unique logical action identity, stable idempotency key, positive attempts, workspace-scoped indexes, and bounded safe output/metadata.
- [ ] Run focused tests and confirm failure before schema/repository implementation.
- [ ] Add `integration_action_runs` with workflow/run/step/credential references, status, attempt, key, safe fields, provider request ID, action lease, and timestamps.
- [ ] Add the unique logical action and idempotency constraints plus status/attempt checks.
- [ ] Implement conditional PostgreSQL transitions so an old worker cannot overwrite a newer terminal result.
- [ ] Store bounded `safeOutput` so workflow completion can recover after a provider success followed by a completion-write failure.
- [ ] Keep the Drizzle schema change staged for the combined action/step-type migration generated after Task 7; do not create a second migration before the workflow constraint is updated.
- [ ] Run the in-memory repository/state tests and verify the transition SQL is ready for the generated migration.
- [ ] Commit the action state implementation without migration metadata with `feat: add durable integration action state`.

The action repository is the only authority for whether a logical external action has already succeeded or become ambiguous.

### Task 7: Add the integration workflow step and operation-policy approval validation

**Files:**
- Modify: `lib/workflows/types.ts`
- Modify: `lib/workflows/validation.ts`
- Modify: `lib/workflows/graph.ts`
- Modify: `lib/workflows/registry.ts`
- Create: `lib/workflows/integration-policy.ts`
- Modify: `lib/workflows/approvals.ts`
- Modify: `lib/workflows/approval-service.ts`
- Modify: `lib/workflows/executors/approval.ts`
- Modify: `lib/database/schema.ts` for the workflow step-run type check
- Create: generated `db/migrations/0012_*.sql`
- Create: generated `db/migrations/meta/0012_snapshot.json`
- Modify: generated migration journal
- Test: `tests/workflow-integration-schema.test.ts`
- Test: `tests/workflow-integration-policy.test.ts`
- Test: `tests/workflow-approval-preview.test.ts`

**Interfaces:**
- `validateIntegrationApprovalPolicy(definition: WorkflowDefinition, registry: WorkflowStepRegistry): void`
- `buildWorkflowApprovalSafeContext(input & { review?: string }): WorkflowApprovalSafeContext`
- `resolveApprovalReview(expression, workflowContext): string | null`
- `IntegrationActionConfig` added to the existing `WorkflowStep` union.

- [ ] Write failing schema tests for the new step, strict config, ancestor-only input references, and rejection of endpoint/credential fields.
- [ ] Write failing graph tests for an approval-required integration action with approval on every path, a bypass branch, a missing approval, and a future non-approval-required operation fixture.
- [ ] Write failing approval-preview tests for bounded string review, non-string rejection, unsafe references, credential absence, and safe persistence.
- [ ] Run focused tests and confirm failure before modifying workflow contracts.
- [ ] Add `INTEGRATION_ACTION` to the step union, shared type tuple, Zod discriminated union, editor-compatible type maps, and database step-type check.
- [ ] Add optional `review` to `APPROVAL` using the existing `WorkflowValueExpression` schema and a stricter preview bound.
- [ ] Resolve and sanitize the review expression before pausing; include it only in `safeContext`.
- [ ] Implement operation-policy graph analysis that checks every reachable path to an approval-required action without globally requiring approval for all steps.
- [ ] Register the integration executor contract only after the static config contract is available; do not add AgentRunner tools.
- [ ] Run `npm.cmd run db:generate`, review the combined action-table and `INTEGRATION_ACTION` step-type SQL as migration `0012`, and confirm no existing data is rewritten.
- [ ] Apply and verify migration `0012` against the existing database and a clean temporary database.
- [ ] Run all existing workflow graph, validation, approval, editor, and schema tests.
- [ ] Commit with `feat: add approval-aware integration workflow contracts`.

Approval preview is presentation data only. It must not alter approval authority or workflow capability resolution.

### Task 8: Integrate credential binding and action execution with the existing workflow runtime

**Files:**
- Create: `lib/workflows/executors/integration-action.ts`
- Modify: `lib/workflows/service.ts`
- Modify: `lib/workflows/executor.ts` only where the existing executor contract needs action recovery handling
- Modify: `lib/workflows/errors.ts`
- Test: `tests/workflow-integration-executor.test.ts`
- Test: `tests/workflow-integration-recovery.test.ts`
- Test: `tests/workflow-authorization.test.ts`
- Test: `tests/workflow-worker.test.ts` for regression coverage

**Interfaces:**
- `integrationActionExecutor: WorkflowStepExecutor<IntegrationActionConfig>`
- `executeIntegrationAction(context: WorkflowStepExecutionContext, config: IntegrationActionConfig): Promise<WorkflowStepResult>`
- `validateWorkflowIntegrationCredentials(principal, workspaceId, definition, db, requireUsable): Promise<void>`

- [ ] Write failing tests for workspace/connector credential resolution, rotation affecting future execution, revoked credential rejection, user execution permission, automation principal scope, and no secret in context/output.
- [ ] Write failing tests for first execution, duplicate job after success, persisted success recovery, active in-flight conflict, stale in-flight ambiguity, provider success followed by completion failure, cancellation, and worker crash boundaries.
- [ ] Run focused runtime tests and confirm failure before executor integration.
- [ ] Resolve workflow expressions into bounded Slack input using existing `createWorkflowContext` and `resolveWorkflowValue`.
- [ ] Require user principals to have `integration.execute` for manual runs containing integration actions; retain internal automation execution only for validated workspace-bound runs.
- [ ] Claim the logical action row before decrypting/calling Slack.
- [ ] Decrypt the current active credential only in the executor call path and erase references after use where practical.
- [ ] Return persisted safe output when action state is already `SUCCEEDED`.
- [ ] Convert ambiguous outcomes into non-retryable `WorkflowStepError` values and never let existing generic retry logic retry them.
- [ ] Pass only bounded safe output and metadata to `completeWorkflowStepAndAdvance`.
- [ ] Run focused runtime tests, all workflow tests, all webhook/schedule/approval tests, and the AgentRunner tests.
- [ ] Commit with `feat: execute approved integration workflow actions durably`.

The integration executor must never call LLMProvider, BrandContext, AgentRunner, shell, SQL, filesystem, or a caller-supplied network target.

### Task 9: Add authenticated credential catalog and management APIs

**Files:**
- Create: `app/api/integrations/catalog/route.ts`
- Create: `app/api/integration-credentials/route.ts`
- Create: `app/api/integration-credentials/[id]/route.ts`
- Create: `app/api/integration-credentials/[id]/rotate/route.ts`
- Test: `tests/integration-routes.test.ts`

**Interfaces:**
- `GET /api/integrations/catalog` returns safe catalog entries.
- `GET /api/integration-credentials?workspaceId=<id>` returns safe projections.
- `POST /api/integration-credentials` accepts strict workspace/connector/name/secret input and returns no secret.
- `GET /api/integration-credentials/:id` returns a safe projection.
- `PATCH /api/integration-credentials/:id` updates safe metadata only.
- `DELETE /api/integration-credentials/:id` revokes and soft-deletes.
- `POST /api/integration-credentials/:id/rotate` accepts replacement secret and returns no secret.

- [ ] Write failing route tests for unauthenticated access, invalid bodies, member mutation denial, cross-workspace IDs, safe catalog/list/detail responses, and absence of secret/ciphertext in every response.
- [ ] Write failing tests for generic error redaction and route handlers using `errorResponse`.
- [ ] Run route tests and confirm expected failures before adding routes.
- [ ] Implement thin handlers: authenticate with Better Auth, parse Zod input, call the credential service, and return typed safe projections.
- [ ] Never call decrypt from a route handler.
- [ ] Run route tests and existing authentication/workspace route tests.
- [ ] Commit with `feat: add integration credential management APIs`.

There is no public credential API and no generic connector execution route.

### Task 10: Add the Integrations dashboard surface

**Files:**
- Create: `components/forms/integration-panel.tsx`
- Create: `components/integrations/credential-list.tsx`
- Create: `components/integrations/credential-form.tsx`
- Modify: dashboard composition files used by `components/flowyn-shell.tsx`
- Test: `tests/integration-panel.test.tsx`

- [ ] Write failing component tests for catalog rendering, safe credential list, create/rotate form clearing, revoke confirmation, MEMBER read-only state, and no secret rendering.
- [ ] Run the focused UI test and confirm failure before component implementation.
- [ ] Implement the panel using existing shadcn-compatible primitives and authenticated API routes.
- [ ] Clear secret input after successful create/rotate and do not copy server responses into visible state.
- [ ] Show safe status and timestamps only; do not show token prefixes or last-four values by default.
- [ ] Keep error messages typed and generic; do not surface provider bodies or keyring errors.
- [ ] Run the focused component test and `npm.cmd run build`.
- [ ] Commit with `feat: add integration credential dashboard`.

### Task 11: Extend the visual editor with the static integration step

**Files:**
- Modify: `components/workflow-editor/workflow-step-palette.tsx`
- Modify: `components/workflow-editor/workflow-node.tsx`
- Modify: `components/workflow-editor/workflow-config-panel.tsx`
- Modify: `components/forms/workflow-editor.tsx`
- Modify: `lib/workflows/editor.ts`
- Modify: `lib/workflows/editor-state.ts` if the existing reducer needs new step defaults
- Test: `tests/workflow-editor.integration.test.ts`
- Test: `tests/workflow-editor-state.test.ts`

- [ ] Write failing editor tests for adding an integration node, safe default config, static Slack/operation selection, credential ID selection, bounded input expressions, approval-policy error display, Advanced JSON parity, and round-trip serialization.
- [ ] Run focused editor tests and confirm failure before UI changes.
- [ ] Add the new node type to the existing static palette and node styling.
- [ ] Load safe credentials from the management API; never load secrets.
- [ ] Render only Slack `post_message` configuration controls and no URL/method/header editors.
- [ ] Keep Canvas and Advanced JSON on the same server PATCH and immutable version path.
- [ ] Preserve layout-only behavior and stale-save conflict handling from M10.
- [ ] Run focused editor tests, existing editor tests, workflow schema tests, and build.
- [ ] Commit with `feat: add Slack integration workflow editor step`.

### Task 12: Add integration documentation, environment wiring, and verification probes

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `SECURITY.md`
- Modify: `SETUP.md`
- Modify: `AI.md` only if the no-AgentRunner-tool boundary needs an explicit entry
- Modify: `scripts/verify-local.ps1`
- Test: `tests/integration-config.test.ts`

- [ ] Write failing configuration tests for disabled egress, malformed keyring, missing current key version, timeout/size bounds, and no `NEXT_PUBLIC` secret variables.
- [ ] Run the focused configuration tests and confirm failure before environment changes.
- [ ] Add server-only app/worker Compose variables with `INTEGRATION_EGRESS_ENABLED=false` as the default.
- [ ] Keep the scheduler and existing health checks unchanged unless a narrowly scoped configuration check is needed.
- [ ] Document that only the worker performs Slack egress and that real testing is opt-in.
- [ ] Document token provisioning outside Flowyn, dedicated test workspace/channel requirements, safe rotation, ambiguous outcomes, and no exactly-once guarantee.
- [ ] Extend `verify-local.ps1` with guarded schema, credential-safe projection, action-state, approval-policy, and egress-disabled checks without removing M1-M10 checks.
- [ ] Run `docker compose config` and inspect the rendered environment for accidental secret exposure.
- [ ] Run focused config tests and documentation/security scans.
- [ ] Commit with `docs: document secure outbound integrations`.

The default Compose configuration must never make a real Slack call merely because services start.

### Task 13: Add opt-in real Slack verification without secret leakage

**Files:**
- Create: `tests/slack-real.integration.test.ts`
- Modify: `scripts/verify-local.ps1` only to keep the real test opt-in
- Modify: `SETUP.md` with the exact opt-in command and required environment names

- [ ] Write a skipped-by-default test guard requiring `FLOWYN_REAL_SLACK_TESTS=true`, a Slack token environment variable, a dedicated workspace/channel environment variable, and `INTEGRATION_EGRESS_ENABLED=true`.
- [ ] Ensure the test never prints environment variables, request headers, raw responses, or token-containing errors.
- [ ] Use a dedicated low-impact test channel and a bounded message containing no user data.
- [ ] Run the test without the opt-in variables and confirm it is skipped, not treated as a pass for live-provider verification.
- [ ] Run it only when explicitly configured, inspect logs for redaction, and remove any local secret values from shell history/environment after testing.
- [ ] Keep default CI and `npm.cmd test -- --run` independent of live Slack credentials.
- [ ] Commit with `test: add opt-in Slack integration verification`.

### Task 14: Full regression verification and implementation handoff

**Files:**
- All M11 implementation files from Tasks 1–13

- [ ] Run `npm.cmd run typecheck`.
- [ ] Run `npm.cmd run lint`.
- [ ] Run `npm.cmd test -- --run`.
- [ ] Run `npm.cmd run build`.
- [ ] Run `docker compose config`.
- [ ] Run `docker compose up -d --build` without deleting volumes.
- [ ] Run `docker compose ps` and confirm app, worker, scheduler, PostgreSQL, Redis, and Ollama remain running/healthy.
- [ ] Run the existing local verification script and the new guarded M11 checks.
- [ ] Verify existing webhook ciphertext, workflow snapshots, schedule occurrences, approvals, layouts, and action rows against the existing database.
- [ ] Verify the full migration chain against a clean temporary database.
- [ ] Run `git diff --check` and inspect all credential, egress, route, queue, audit, and AI boundaries.
- [ ] Commit the verified production implementation with `feat: add secure outbound integrations`.
- [ ] Do not push and do not begin M12.

## Verification matrix

The implementation is complete only when all of the following are demonstrated:

- Static Slack registry and strict operation schemas.
- No generic URL/method/header/port/redirect capability.
- Credential vault CRUD, rotation, revocation, safe projections, and workspace isolation.
- Existing webhook encryption compatibility and separate integration keyring behavior.
- `INTEGRATION_ACTION` definition validation and editor round-trip.
- Operation-policy approval enforcement on every reachable path.
- Bounded approval preview without secret or hidden-reasoning leakage.
- Durable action state, duplicate suppression, safe success recovery, and ambiguous terminal handling.
- Provider retry classification bounded by existing workflow policy.
- User, automation, webhook, scheduler, and AgentRunner boundary tests.
- Authenticated APIs and minimal safe UI.
- Default egress disabled and opt-in real Slack testing.
- Existing M1-M10 tests, migration, Docker, health, workflow, scheduling, webhook, approval, AI, RAG, and agent behavior unchanged.
