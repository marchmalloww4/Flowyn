# Milestone 8 — Secure Webhooks and External Workflow Triggers Design

## Status

Approved architecture. This document defines Milestone 8 only. Milestones 1–7 remain intact. Milestone 9 and the exclusions below are not implemented by this milestone.

## Objective

Allow an external system to durably trigger an enabled Flowyn workflow through a narrowly scoped, workspace-owned inbound webhook. The public request is authenticated with a rotatable HMAC secret, protected against replay and duplicate delivery, persisted before asynchronous execution, and then handed to the existing workflow run, transactional outbox, BullMQ, worker, AgentRunner, RAG, AI, lease, retry, cancellation, and audit boundaries.

The trusted execution flow is:

```text
external POST
  -> bounded raw-body read
  -> Redis admission limit
  -> public-trigger lookup
  -> HMAC/timestamp verification
  -> bounded JSON validation
  -> PostgreSQL event dedupe and durable run/outbox transaction
  -> existing outbox dispatcher
  -> existing BullMQ workflow worker
  -> existing static workflow registry and controlled AgentRunner/LLMProvider/RAG
```

The public request never executes a workflow, calls Ollama, invokes an agent, publishes to a third party, or accepts a workspace, user, workflow, principal, role, or tool choice from the sender.

## Scope boundaries

Milestone 8 includes:

- Workspace-owned webhook trigger configuration for an existing workflow.
- High-entropy non-secret public identifiers.
- Versioned AES-256-GCM encryption of webhook secrets at rest.
- Secret rotation and revocation/disable behavior.
- HMAC-SHA256 request authentication over the exact timestamp and raw request bytes.
- A bounded timestamp replay window and bounded JSON request contract.
- Redis admission rate limiting with fail-closed behavior when the limiter is unavailable.
- PostgreSQL-authoritative delivery/event deduplication and durable event history.
- Durable creation of an existing workflow run and outbox dispatch record in the same transaction as the accepted event.
- Reuse of the existing workspace automation principal with a webhook origin.
- Authenticated management APIs, delivery history, audit events, and focused UI.
- Bounded expiry metadata and scheduler-driven cleanup of old webhook event records.
- Documentation, generated migration, unit/integration/route/runtime verification.

It does not include outbound HTTP, OAuth, third-party credential integrations, Gmail, Slack, Shopify, LinkedIn/social publishing, browser automation, file uploads, human approvals, multi-agent orchestration, billing, a visual workflow editor, marketplace features, arbitrary code/shell/SQL/filesystem access, unrestricted AI tools, or Milestone 9.

## Existing architecture reused

The implementation remains within the existing modular monolith and reuses:

- Better Auth session lookup through `requireUser`.
- Central workspace membership and action checks in `lib/authz/authorization.ts`.
- `AppError`, Zod validation, `readJson`, and `errorResponse`.
- Drizzle/PostgreSQL and generated migrations.
- Sanitized audit persistence through `recordAuditEvent`.
- Existing `workflowRuns`, immutable workflow versions, run snapshots, input policy, and `workflow_run_dispatches` transaction/outbox.
- Existing BullMQ/Redis connection and worker/executor lease, retry, timeout, cancellation, and safe tool boundaries.
- `LLMProvider`, brand-scoped `BrandContext`, filtered knowledge retrieval, and the controlled static AgentRunner/tool registry.
- The existing `WORKSPACE_AUTOMATION` internal principal instead of a fake user or a second execution engine.
- The PostgreSQL-authoritative scheduler process for bounded maintenance.
- Existing Docker Compose services, named volumes, and development data.

No second authentication system, authorization layer, queue, scheduler truth store, workflow engine, agent engine, or AI provider is introduced.

## User-facing capability

An OWNER or ADMIN can create a webhook trigger for an existing workflow, enable or disable it, rotate its secret, inspect safe delivery history, and delete it. Creation returns the plaintext secret once; subsequent reads never return it. A MEMBER can read trigger configuration and safe delivery metadata but cannot create, change, enable, disable, delete, or rotate a trigger.

The management UI displays the endpoint URL, enabled state, selected workflow, created/updated timestamps, last accepted delivery state, and safe delivery history. It displays a newly created or rotated secret only in the one-time response surface and explicitly warns the user that Flowyn cannot recover plaintext secrets.

The external sender receives `202 Accepted` for a newly accepted delivery and for a recognized duplicate. Public errors are intentionally generic to limit trigger enumeration and signature-oracle behavior.

## Protocol contract

The public endpoint is:

```text
POST /api/hooks/:publicId
```

Required headers:

- `Content-Type: application/json`.
- `X-Flowyn-Timestamp`: Unix seconds as a canonical decimal integer.
- `X-Flowyn-Signature`: `v1=<lowercase hexadecimal HMAC-SHA256>`.

Optional header:

- `X-Flowyn-Event-Id`: bounded printable identifier used for delivery deduplication.

The signed message is the exact UTF-8 byte sequence:

```text
<timestamp>.<raw request body bytes>
```

The HMAC key is the active decrypted trigger secret. Verification uses a fixed-length digest and `crypto.timingSafeEqual`; malformed versions, lengths, timestamp values, or signatures are rejected before comparison. The default accepted timestamp skew is 300 seconds and is configurable only through server configuration. The server never derives the signature from parsed or re-serialized JSON.

The raw body is limited to 256 KiB before parsing. The JSON root must be an object and must pass the existing safe JSON and workflow-input bounds: finite values, bounded depth, key count, array count, string sizes, and the existing workflow input character limit. Credentials and secrets are not accepted as special capabilities and are treated as ordinary payload data; senders must not place credentials in webhook payloads. Existing workflow run and safe step history may contain the bounded input as workspace data visible to the existing authorized run readers.

## Database model

### `workflow_webhook_triggers`

Add a workspace-owned table with:

- `id` — UUID primary key.
- `workspaceId` — required workspace foreign key, cascade on hard workspace deletion.
- `workflowId` — required workflow foreign key, cascade on hard deletion; soft-deleted workflows are handled by ingress and history logic.
- `publicId` — unique, non-secret base64url identifier generated from 32 random bytes.
- `name` — bounded display name.
- `enabled` — whether new deliveries may be accepted.
- `secretCiphertext` — versioned AES-256-GCM envelope; never plaintext.
- `secretKeyVersion` — encryption-key version used for this envelope.
- `secretVersion` — monotonically increasing active secret version for rotation/audit.
- `createdBy` — nullable user foreign key with `SET NULL`, provenance only.
- `createdAt`, `updatedAt`, and nullable `deletedAt`.

The public ID is not a credential. The trigger secret is the credential and is never included in normal row projections, logs, audit metadata, API reads, or event history.

### `workflow_webhook_events`

Add a workspace-owned delivery ledger with:

- `id` — UUID primary key.
- `workspaceId` and `triggerId` — required foreign keys with workspace-consistency constraints enforced by the service transaction.
- `externalEventIdHash` — nullable SHA-256 hash of the normalized bounded event ID; never store the raw ID.
- `dedupeKey` — deterministic versioned key, unique per trigger.
- `dedupeWindowStart` — nullable UTC bucket start for payload-only dedupe.
- `payloadSha256` — SHA-256 of canonical bounded JSON.
- `payloadBytes` — raw body byte count.
- `contentType` — normalized content type.
- `secretVersion` — active secret version used for verification.
- `status` — `TRIGGERED`, `SKIPPED`, or `FAILED`.
- `reasonCode` — safe enum-like diagnostic code, never raw error text.
- `workflowRunId` — nullable existing workflow-run foreign key with `SET NULL`.
- `receivedAt`, `processedAt`, `lastSeenAt`, `duplicateCount`, and `expiresAt`.

No raw body, request headers, IP address, signature, plaintext secret, or arbitrary error message is stored. The event ledger is metadata and dedupe state; the existing bounded workflow run input is the execution input.

Uniqueness uses `(triggerId, dedupeKey)`. An event ID delivery uses `event:<sha256(normalized-event-id)>`. Without an event ID, the key uses `payload:<sha256(canonical-json)>:<replay-window-bucket>`. Payload-only dedupe is explicitly bounded: an identical payload in a later bucket may create a new run.

Event records expire after the configured 30-day retention period. The existing scheduler performs bounded, non-blocking cleanup of expired event metadata. Once expired metadata is deleted, a fresh correctly signed delivery can be accepted again; this is documented behavior, not a correctness bypass within the retention window.

## Secret storage and rotation

Use Node's built-in `crypto` AES-256-GCM behind `lib/security/secrets.ts`, with a versioned envelope containing a format marker, key version, random 12-byte nonce, ciphertext, and authentication tag. The authenticated data binds the envelope to the trigger ID and secret version. The server requires `WEBHOOK_SECRET_ENCRYPTION_KEY` to decode to exactly 32 bytes and requires an explicit `WEBHOOK_SECRET_KEY_VERSION`.

Secret generation uses cryptographically secure random bytes. Rotation atomically replaces the encrypted secret, increments `secretVersion`, and returns the new plaintext secret only in the rotation response. Existing secrets are not retained as an active fallback. Disabling or deleting a trigger immediately prevents new public deliveries; deleting removes or tombstones the trigger according to existing workspace deletion conventions. Secret material is redacted by error handling and audit sanitization.

## Public ingress behavior

The route handler remains thin: it reads the bounded raw request, applies admission control, calls the webhook service, and maps typed results/errors to the generic public response.

The service performs these steps in order:

1. Apply global and per-trigger Redis rate limits. The rate limiter uses atomic increment/expiry operations. If Redis is unavailable, the public endpoint fails closed with `503` and does not read or persist a delivery.
2. Look up the public ID without revealing whether a trigger exists, is disabled, deleted, or belongs to a workspace. Unknown and disabled triggers use the same generic rejection response.
3. Lock the trigger row for the verification/acceptance transaction, decrypt the active secret, and verify timestamp and HMAC over the raw bytes.
4. Parse JSON only after authentication and enforce the root-object and safe-input bounds.
5. Compute the event dedupe key and payload metadata without persisting the raw request.
6. In one PostgreSQL transaction, insert the event if its dedupe key is new. If it is a duplicate, increment bounded duplicate metadata and return `202` without creating another run.
7. If the workflow is disabled or deleted, mark a valid authenticated event `SKIPPED` with a safe reason and commit without a run.
8. Otherwise reuse the existing automation workflow-run creation path to snapshot the current workflow version, insert `workflow_runs` and `workflow_run_dispatches`, link the event, and commit.
9. Return `202` only after the transaction commits. The response contains no secret, workspace ID, user ID, workflow definition, or detailed verification reason.

The public path never calls the BullMQ queue directly and never waits for execution. Database errors return a generic `503`; authentication, bounds, disabled, unknown, and malformed requests use indistinguishable generic `4xx` behavior. A valid request with a disabled workflow is accepted into history as `SKIPPED`, while a disabled/deleted trigger is rejected before event persistence.

## Principal and execution integration

Extend the existing `WorkspaceAutomationPrincipal` with an origin discriminated union while preserving the existing schedule constructor and semantics:

```text
kind: "workspace_automation"
workspaceId: string
origin:
  { type: "schedule", scheduleId: string }
  | { type: "webhook", webhookTriggerId: string, webhookEventId: string }
```

No fake Better Auth user is created and `workflowRuns.startedBy` remains `NULL` for automation. The generalized automation run service validates that the origin resource, workspace, workflow, and event all agree before inserting a run. `resolveWorkflowRunPrincipal` first resolves a schedule occurrence or webhook event by the run link and returns the corresponding origin. Missing or cross-workspace origin data is a controlled `WORKFLOW_PRINCIPAL_MISSING` failure.

The existing workflow worker and executor continue to use the resolved principal. AI steps still use `LLMProvider`; agent steps still use `AgentRunner` and the safe static tool registry; RAG remains brand/workspace filtered; workflow steps remain static registry entries. The webhook path adds no capabilities to the agent or workflow runtime.

## Management APIs

All management APIs require Better Auth and a workspace membership check. Workspace IDs come from the authenticated request context and are never accepted as authorization truth from an unverified public delivery.

Routes:

- `GET /api/workflow-webhooks?workspaceId=<id>` — authorized list; no secrets.
- `POST /api/workflow-webhooks` — OWNER/ADMIN create; strict body schema and existing workflow membership validation; returns plaintext secret once.
- `GET /api/workflow-webhooks/:id` — authorized safe detail; no secret.
- `PATCH /api/workflow-webhooks/:id` — OWNER/ADMIN update name/workflow; no secret fields accepted.
- `DELETE /api/workflow-webhooks/:id` — OWNER/ADMIN delete/disable according to the existing soft-delete convention.
- `POST /api/workflow-webhooks/:id/enable` and `/disable` — OWNER/ADMIN state changes.
- `POST /api/workflow-webhooks/:id/rotate-secret` — OWNER/ADMIN; returns the new secret once.
- `GET /api/workflow-webhooks/:id/events` — authorized bounded history with pagination; no payload, headers, or secret.

Every request body has a strict Zod schema. Route handlers authenticate, validate, authorize, call a service, and return typed responses.

## Authorization and workspace isolation

Add centralized actions for `workflow_webhook.read`, `create`, `update`, `enable`, `disable`, `delete`, and `rotate_secret`. OWNER can perform all actions. ADMIN can perform all webhook management mutations and reads. MEMBER can read safe configuration and history only. Public delivery has no authenticated user and therefore bypasses management authorization only through the cryptographic trigger credential; it can access exactly one trigger identified by the opaque public ID and can cause only that trigger's configured workflow to run.

Every trigger and event query is constrained by the authenticated workspace membership for management operations. Every public acceptance transaction validates trigger workspace, workflow workspace, event workspace, workflow run workspace, and automation origin together. Event history never returns another workspace's metadata. Public errors do not confirm whether an ID maps to a trigger.

## Security boundaries and threat model

Threats addressed:

- Public ID enumeration: 32-byte random IDs, generic rejection, no detailed errors, no secret in URL.
- Secret disclosure: encrypted at rest, one-time reveal, redaction, no event/header persistence.
- Forged requests: HMAC over raw bytes with constant-time comparison and active-secret versioning.
- Replay: timestamp skew check plus event-ID dedupe and bounded payload/window dedupe.
- Duplicate delivery: PostgreSQL unique key and atomic transaction, independent of Redis.
- Resource exhaustion: raw-body, JSON, input, history-page, rate, and database-batch bounds.
- Rate-limit bypass: global and trigger-keyed Redis counters; optional IP dimension uses only explicitly configured trusted proxy metadata.
- Cross-tenant access: centralized membership/action checks and repeated workspace consistency checks.
- Execution escalation: public payload cannot choose a workflow, principal, role, agent tool, model, endpoint, SQL, shell, filesystem, or code.
- Error side channels: generic public status/body and safe internal reason codes only.

The new boundary is inbound external HTTP plus possession of a workspace webhook secret. It does not authorize outbound network access. The endpoint is intentionally not a general integration adapter.

## Background jobs and runtime

The public route commits `workflow_webhook_events`, `workflow_runs`, and `workflow_run_dispatches` before asynchronous work. The existing outbox dispatcher remains the only path that queues the workflow run. The existing worker owns execution, retry, lease recovery, and final run status. A webhook event never directly calls Ollama or an agent.

The existing scheduler remains PostgreSQL-authoritative and gains a bounded cleanup pass for expired webhook event metadata. Cleanup is best-effort and does not affect acceptance correctness; an outage delays deletion but does not delete active event records or create runs. No new process or queue is added. Docker Compose keeps the current app, worker, scheduler, PostgreSQL, Redis, Ollama, and named volumes unchanged apart from documented webhook environment configuration.

## Idempotency, retries, and timeouts

- Event-ID deliveries dedupe by trigger and hashed normalized event ID for the retention period.
- Payload-only deliveries dedupe by canonical payload hash and timestamp bucket; this is bounded replay protection, not global semantic idempotency.
- The unique database key is authoritative. Redis rate limiting is never used for dedupe correctness.
- Public request processing has a bounded body-read and database transaction timeout and returns generic `503` when durable acceptance cannot complete.
- Queue dispatch and workflow execution retain existing outbox retry, BullMQ retry, lease, step timeout, and run recovery behavior.
- A duplicate accepted delivery never extends or recreates the original workflow run. It only updates bounded duplicate metadata.

## Failure and recovery semantics

- Unknown, disabled, deleted, malformed, stale, or invalid-signature requests do not create event or run records.
- Valid requests for disabled/deleted workflows create a `SKIPPED` event with a safe reason and no run.
- A PostgreSQL transaction failure rolls back event and run creation; the sender gets `503` and may retry with the same event ID.
- If outbox dispatch fails after commit, the existing outbox retry path recovers it without another workflow run.
- If the worker crashes, existing run leases/retries recover execution.
- If the scheduler cleanup pass fails, event retention is temporarily longer and no active delivery is lost.
- If Redis is unavailable, public ingress fails closed. Management APIs remain governed by their existing database/authentication paths.

## Audit strategy

Record sanitized workspace audit events for webhook creation, update, enable, disable, secret rotation, and deletion. Add `workflow_webhook` and `workflow_webhook_event` resource types. Audit metadata contains IDs, safe names, status, secret version, and reason codes only; it never contains secrets, signatures, raw headers, raw payloads, or credential-like values. Individual deliveries are represented by the event ledger, not one audit row per public request, to avoid audit amplification.

## UI implications

Add a focused dashboard panel for webhook triggers and safe delivery history using existing workspace selection, auth, shadcn/ui, Tailwind, and API conventions. The UI must:

- Never put the secret in a persistent URL or regular list response.
- Make one-time secret reveal and rotation explicit.
- Show enabled/disabled state and workflow name from authorized management data.
- Render only safe event metadata and a generic status/reason label.
- Avoid exposing raw webhook payloads or headers in the default history view.
- Handle `401`, `403`, `404`, `409`, `429`, and `503` through the existing error surface.

## Migration strategy

Update `lib/database/schema.ts`, generate the next Drizzle migration with `npm run db:generate`, review the SQL and snapshot, and run it against the existing PostgreSQL database with `npm run db:migrate`. The migration must be additive, preserve all existing tables/volumes/data, create the required indexes/constraints, and avoid resetting the database. Existing schedule and manual workflow rows must continue to resolve through the unchanged paths.

## Configuration and Docker

Add documented configuration with safe local defaults:

- `WEBHOOK_SECRET_ENCRYPTION_KEY` — required 32-byte base64 key in non-test deployments.
- `WEBHOOK_SECRET_KEY_VERSION` — explicit key version.
- `WEBHOOK_REPLAY_WINDOW_SECONDS` — default 300, bounded by policy.
- `WEBHOOK_MAX_BODY_BYTES` — default 262144 and bounded by policy.
- `WEBHOOK_RATE_LIMIT_GLOBAL_PER_MINUTE` and `WEBHOOK_RATE_LIMIT_TRIGGER_PER_MINUTE` — bounded local defaults.
- `WEBHOOK_EVENT_RETENTION_DAYS` — default 30, bounded by policy.
- `WEBHOOK_PUBLIC_BASE_URL` — trusted configured public URL used for management display; never derived from the Host header.

The app and scheduler receive the same encryption/rate/replay/retention configuration. Existing PostgreSQL, Redis, Ollama, ports, health checks, named volumes, and worker behavior remain unchanged. No dependency upgrade is required; Node's built-in crypto is used.

## Testing strategy

Test-first coverage must include:

- Secret envelope generation, encryption/decryption, key-version validation, tamper rejection, trigger-bound AAD, and redaction.
- Canonical JSON/hash and dedupe-key determinism, event-ID normalization, timestamp parsing, signature formatting, constant-time verification, replay boundaries, and raw-byte sensitivity.
- Body/content-type/root-object/size/depth/key/string bounds and rejection of executable-looking capabilities.
- Redis rate-limit atomic behavior, expiry, global/per-trigger limits, and fail-closed errors.
- Schema exports, workspace consistency, unique dedupe behavior, event retention cleanup, and generated migration review.
- Trigger management authorization for OWNER/ADMIN/MEMBER and cross-workspace denial.
- One-time secret reveal/rotation and safe API projections.
- Public route generic responses, unknown/disabled/invalid/replay/duplicate cases, transaction rollback, workflow-disabled `SKIPPED`, and 202-after-commit behavior.
- Automation principal resolution for schedules and webhooks, cross-workspace origin rejection, and preservation of manual/scheduled behavior.
- Outbox/worker integration proving one accepted delivery creates one existing run and the worker executes through existing registry boundaries.
- UI rendering and safe history fields.
- Full existing regression suite plus `npm run typecheck`, `npm run lint`, `npm run build`, Docker Compose configuration/startup, health checks, and local verification.

## Ordered implementation tasks

1. Write and review this design/specification and the implementation plan.
2. Add failing pure security/protocol/payload/rate-limit tests, then implement the bounded security modules and environment policy.
3. Add failing schema/service tests, then add webhook tables, generated migration, safe projections, and event retention cleanup.
4. Generalize automation-principal and durable run creation seams with schedule regression tests, then add webhook-origin creation and resolution.
5. Add failing management-route/service authorization tests, then implement trigger CRUD, enable/disable, rotation, and event history APIs.
6. Add failing public-ingress tests, then implement raw-body routing, rate limiting, HMAC verification, dedupe, durable transaction, and generic response mapping.
7. Add UI coverage and implement the focused webhook management/history panel.
8. Integrate scheduler cleanup, update environment/setup/security/runtime documentation, and verify Docker without removing volumes.
9. Run the complete verification matrix, perform a security/regression review, and commit locally without pushing.

## Recommended specification refinements

The approved scope treats the bounded webhook payload as workspace data because existing workflow run and safe step history persist bounded workflow input and existing readers expose it to authorized workspace members. Senders must not include credentials. A future requirement to guarantee that webhook payloads never appear in run/step history would require a separate encrypted payload-reference and resolver design; it is not silently approximated in M8.

The configured `WEBHOOK_PUBLIC_BASE_URL` should be a complete trusted origin with no user-controlled path or host components. Production deployments should place the endpoint behind TLS and a trusted reverse proxy, while the application continues to reject spoofed forwarding headers unless explicitly configured.

## Explicit Milestone 9 exclusions

Milestone 9 is not started. It must not be inferred from this implementation and remains excluded from M8: outbound integrations, OAuth/credential brokerage, arbitrary external HTTP tools, browser automation, file uploads, approvals, multi-agent orchestration, billing, marketplace, visual editor, and any new unrestricted execution capability.
