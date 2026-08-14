# Milestone 11 — Secure Outbound Integrations & Credential Vault

## Status

Approved architecture. This document is the authoritative design for Milestone 11. It does not authorize Milestone 12 or any production implementation outside the scope below.

## Objective

Milestone 11 adds a secure foundation for approved outbound third-party actions. Flowyn will store workspace-scoped credentials, expose a server-controlled connector catalog, execute one narrowly scoped Slack operation through the existing durable workflow worker, and record safe action state for retries, idempotency, audit, and recovery.

The authoritative execution path is:

```text
immutable workflow snapshot
  -> static connector registry
  -> trusted connector executor
  -> workspace credential vault
  -> fixed Slack HTTPS endpoint
  -> bounded validated response
  -> existing workflow step/run state
```

This is not a generic HTTP subsystem. Workflow data, AI, AgentRunner, webhook input, the visual editor, and clients must never select an arbitrary host, protocol, port, redirect, method, header, credential, or executable module.

## Scope

M11 includes:

- A workspace-scoped encrypted credential vault.
- A separate versioned integration credential keyring.
- A static connector registry with safe catalog metadata.
- One connector only: Slack.
- One operation only: `slack.post_message`.
- A bounded internal egress client used only by trusted connector implementations.
- A static `INTEGRATION_ACTION` workflow step.
- Operation-policy-driven approval enforcement.
- A bounded approval review/preview extension on the existing `APPROVAL` step.
- PostgreSQL-authoritative integration action state.
- Deterministic logical action identity and provider-aware retry classification.
- Explicit ambiguous-outcome handling with no automatic retry.
- Authenticated credential management APIs.
- A minimal integrations dashboard surface.
- Visual-editor support for the static integration step.
- Safe audit events, focused tests, documentation, and runtime verification.

## Non-goals and explicit exclusions

M11 does not include:

- Generic HTTP or generic fetch workflow steps.
- Arbitrary user-provided URLs, methods, headers, ports, redirects, or hosts.
- OAuth brokerage, callback handling, refresh tokens, or broad provider authorization.
- Discord, Resend, Gmail, Shopify, LinkedIn, or social publishing.
- Browser automation, shell, curl, SQL, filesystem, dynamic code, or dynamic modules.
- User-written connectors, connector plugins, or a marketplace.
- Direct AgentRunner integration tools.
- Multi-agent orchestration.
- File uploads.
- Billing, quotas, or production deployment.
- Public approval links or external approval channels.
- A new worker, queue, scheduler, workflow runtime, authentication system, or authorization system.
- Exactly-once claims for external side effects.

## Existing architecture to preserve

The implementation must reuse:

- Better Auth and server-side session lookup.
- `requireWorkspaceAction`, `requireWorkspaceMember`, and the existing role policy.
- Drizzle/PostgreSQL and generated migrations.
- `AppError`, `WorkflowStepError`, Zod validation, `readJson`, and `errorResponse`.
- The existing versioned AES-256-GCM webhook secret pattern without changing existing webhook ciphertext behavior.
- `recordAuditEvent` and sanitized audit metadata.
- `WorkflowStepExecutor`, `WorkflowStepRegistry`, graph validation, bounded expressions, and immutable workflow snapshots.
- Existing workflow run leases, step claims, cancellation, retry classification, outbox, BullMQ queue, and worker.
- Existing `APPROVAL` requests and generation-aware continuation dispatch.
- Existing visual editor projection, optimistic `currentVersionId` saves, and metadata-only layouts.
- Existing LLMProvider, BrandContext/RAG, and controlled AgentRunner without adding integration tools.

## Trust boundaries and threat model

M11 adds one new trust boundary: the trusted Flowyn worker makes an outbound request to Slack.

The external boundary must defend against:

- Credential theft, plaintext exposure, ciphertext leakage, and key-version confusion.
- Cross-workspace credential use and connector/credential mismatch.
- SSRF, private-network access, DNS rebinding, and redirect abuse.
- Untrusted provider response bodies and oversized responses.
- Provider rate limits, outages, transient errors, and malformed responses.
- Duplicate BullMQ delivery and duplicate external side effects.
- Worker crashes before, during, or after a provider call.
- Prompt injection or agent output causing an unapproved external action.
- Approval bypass, forged automation principals, and confused-deputy behavior.
- Provider scope overreach and unsafe audit/logging.

The client, workflow definition, workflow input, webhook body, AI output, and AgentRunner are untrusted data sources. They may provide bounded operation data, but never execution capability.

## Connector registry

Create a static registry under `lib/integrations/`.

The conceptual contracts are:

```ts
export type ConnectorId = "slack";
export type ConnectorAuthType = "API_TOKEN";

export interface ConnectorOperationDefinition<TInput, TOutput> {
  id: string;
  displayName: string;
  inputSchema: ZodType<TInput>;
  outputSchema: ZodType<TOutput>;
  risk: "EXTERNAL_SIDE_EFFECT";
  requiresApproval: boolean;
  retryPolicy: ConnectorRetryPolicy;
}

export interface ConnectorDefinition {
  id: ConnectorId;
  displayName: string;
  authType: ConnectorAuthType;
  credentialSchema: ZodType<unknown>;
  operations: Record<string, ConnectorOperationDefinition<unknown, unknown>>;
}

export interface TrustedIntegrationContext {
  workspaceId: string;
  workflowRunId: string;
  workflowStepId: string;
  workflowStepRunId: string;
  idempotencyKey: string;
  abortSignal: AbortSignal;
}

export interface ConnectorExecutor {
  connectorId: ConnectorId;
  operation: string;
  execute(
    context: TrustedIntegrationContext,
    input: unknown,
    credential: unknown,
  ): Promise<SafeIntegrationResult>;
}
```

The registry must reject unknown connector IDs and operations, expose only safe metadata to the UI, use static imports, and never dynamically load user-selected code.

The registry is not an HTTP request builder. Connector implementations construct their own fixed provider request and may call only the internal bounded egress primitive.

## Slack connector contract

M11 supports only:

```text
connector: slack
operation: post_message
endpoint: https://slack.com/api/chat.postMessage
authentication: externally provisioned Slack API token
approval: required
```

The operation input is:

```ts
interface SlackPostMessageInput {
  channel: string;
  text: string;
}
```

Flowyn resolves the two strings from bounded workflow expressions, rejects control characters and oversized values, and constructs the exact provider request. The request contains only `channel` and `text` in the JSON body plus server-generated authentication and content-type headers.

The connector must not accept URL, method, port, header, query, redirect, attachment, block, or arbitrary-body fields. It must not expose a Slack token to the browser, workflow context, AI prompt, AgentRunner, queue, audit metadata, or logs.

The safe output is bounded and provider-shaped, for example:

```ts
interface SlackPostMessageOutput {
  provider: "slack";
  channel: string;
  providerMessageId: string;
}
```

The full Slack response is never persisted or returned as workflow output.

## Credential vault

Add an `integration_credentials` table with:

```text
id
workspaceId
connectorId
name
encryptedSecretMaterial
keyVersion
secretVersion
createdBy
createdAt
updatedAt
revokedAt
deletedAt
lastUsedAt
```

Recommended database constraints and indexes:

- Workspace foreign key with cascade behavior matching existing workspace-owned resources.
- Creator foreign key with `SET NULL` semantics for historical integrity.
- Workspace/name uniqueness.
- Workspace index and active-status lookup index.
- Positive `secretVersion` check.
- Non-empty `connectorId` validated against the application registry.

The encrypted material is connector-specific JSON, currently `{ "apiToken": "..." }`. Connector metadata and the credential name remain non-secret columns. No raw secret column exists.

Credential deletion is a soft deletion/revocation operation. Historical action records remain associated with the credential ID and safe metadata. A future cleanup policy must not remove rows needed to explain historical runs.

## Encryption and key rotation

Reuse the cryptographic design in `lib/security/secrets.ts`, but introduce a purpose-aware internal SecretBox contract without silently rewriting webhook ciphertext.

The integration SecretBox must:

- Use AES-256-GCM with authenticated associated data.
- Bind the envelope to purpose, connector ID, credential ID, key version, and secret version.
- Store the envelope version and key version in the ciphertext envelope and database projection.
- Use a separate integration credential keyring from the existing webhook key.
- Support current and previous key versions through server-only configuration.
- Increment `secretVersion` whenever the credential material is replaced.
- Fail closed for an unknown key version or invalid authentication tag.

Existing webhook encrypt/decrypt functions and ciphertext remain compatible. No migration silently decrypts and rewrites webhook secrets.

Recommended server-only environment shape:

```text
INTEGRATION_CREDENTIAL_KEYRING_JSON={"v1":"<base64-32-byte-key>"}
INTEGRATION_CREDENTIAL_CURRENT_KEY_VERSION=v1
```

The keyring must never be sent to the browser, included in errors, or logged.

## Secret lifecycle

Creation and rotation accept plaintext only in the authenticated request body and process it only in server memory. Responses contain safe credential projections, never the submitted secret.

Rules:

- GET/list never returns plaintext or ciphertext.
- PATCH changes safe metadata only.
- Rotation replaces the encrypted secret, increments `secretVersion`, and preserves the credential ID.
- Revocation immediately blocks future execution.
- Future execution resolves the current active secret by credential ID.
- A credential is decrypted only inside the trusted worker connector path.
- Secrets never enter workflow definitions, versions, run input/output, step output, BullMQ payloads, prompts, agent history, audit metadata, logs, or provider error messages.

Rotating a credential therefore affects future executions without rewriting immutable workflow snapshots.

## Workflow step contract

Add `INTEGRATION_ACTION` to the static workflow step union while preserving existing definitions:

```ts
export interface IntegrationActionConfig {
  connectorId: "slack";
  credentialId: string;
  operation: "post_message";
  input: {
    channel: WorkflowValueExpression;
    text: WorkflowValueExpression;
  };
}
```

Example:

```json
{
  "type": "INTEGRATION_ACTION",
  "name": "Post Slack message",
  "config": {
    "connectorId": "slack",
    "credentialId": "00000000-0000-4000-8000-000000000000",
    "operation": "post_message",
    "input": {
      "channel": { "kind": "literal", "value": "C123456" },
      "text": { "kind": "reference", "path": "steps.prepare.output.text" }
    }
  },
  "nextStepId": "finish"
}
```

The validator must:

- Validate connector and operation against the static registry.
- Validate the credential ID as a UUID.
- Resolve credential ownership by workspace.
- Confirm credential connector matches the step connector.
- Require active credential material when enabling or running.
- Permit disabled definitions to retain an existing but unusable binding while still requiring ownership and connector consistency.
- Reject arbitrary URL, header, method, port, redirect, or secret fields.
- Validate all workflow references using the existing ancestor-only reference rules.

The workflow snapshot stores the step configuration and credential ID only. The current credential is resolved at execution time.

The existing `schemaVersion: 1` is retained because adding a step type is an additive registry extension. Historical six-step definitions remain valid and executable.

## Operation-policy-driven approval

Approval is a connector-operation policy, not a global workflow rule.

Each operation definition declares:

```ts
requiresApproval: boolean;
```

For M11:

```text
slack.post_message.requiresApproval = true
```

The validator must prove that every reachable path from the workflow entry to the integration action passes through an `APPROVAL` step. A definition with a bypass branch is rejected. Future operations may declare `requiresApproval: false` without changing the graph validator’s global behavior.

Approval remains human-only. AI, AgentRunner, webhook callers, workflow input, and automation principals cannot approve or bypass the request.

## Approval preview

Extend the existing `APPROVAL` config with an optional bounded review expression:

```ts
interface WorkflowApprovalConfig {
  requiredRole: WorkflowApprovalRole;
  expiresAfterSeconds?: number;
  review?: WorkflowValueExpression;
}
```

The expression uses the existing safe workflow reference system and may reference only completed ancestor outputs. At runtime:

- Resolve the expression before pausing.
- Require a string result when present.
- Apply the existing workflow context bounds plus a stricter preview limit.
- Store only the bounded preview in `workflowApprovalRequests.safeContext`.
- Redact no credentials because credentials are not in workflow context.
- Never store prompts, hidden reasoning, authorization headers, full provider responses, or ciphertext.

The preview is presentation data only. It does not grant authority, select a connector, or alter execution. If absent, the existing safe approval metadata remains the fallback.

## Action state machine

Add `integration_action_runs` as the PostgreSQL authority for each logical integration action:

```text
PENDING -> IN_FLIGHT -> SUCCEEDED
                    -> FAILED
                    -> AMBIGUOUS
                    -> CANCELLED
```

The table contains:

```text
id
workspaceId
workflowRunId
workflowStepId
workflowStepRunId
connectorId
operation
credentialId
credentialSecretVersion
idempotencyKey
attempt
status
providerRequestId
safeResponseMetadata
safeOutput
errorCode
leaseExpiresAt
startedAt
completedAt
createdAt
updatedAt
```

Use a unique logical-action constraint on `(workflowRunId, workflowStepId)` and a workspace-scoped unique idempotency key. The row may update its latest `workflowStepRunId` and `attempt` while the normal workflow step history retains individual attempts.

Before the provider call, the executor transactionally creates or claims the action row as `IN_FLIGHT`. After a proven success, it stores only safe output and metadata. A completed action is returned from PostgreSQL on duplicate delivery without another provider call.

An active `IN_FLIGHT` action is not executed concurrently. A stale `IN_FLIGHT` action becomes `AMBIGUOUS`, because the provider-call boundary cannot prove whether Slack accepted the request.

## Idempotency

Flowyn does not claim exactly-once execution.

The logical action identity is derived from the immutable workflow run and step, for example:

```text
logical-action = SHA-256(workflowRunId + ":" + workflowStepId)
```

The resulting bounded key is reused for local retries of the same logical action. The action row’s `attempt` records local attempts. Duplicate jobs, worker restarts, and workflow completion retries must reuse the durable action row rather than blindly issue another external call.

Slack’s operation is treated as lacking a Flowyn-controlled idempotency guarantee. Therefore any outcome where external success cannot be proven becomes `AMBIGUOUS` and is not automatically retried.

## Ambiguous outcomes

The following are terminal `AMBIGUOUS` outcomes:

- Slack timeout.
- Connection loss after request dispatch may have occurred.
- Unknown provider 5xx outcome.
- Worker crash around the provider-call boundary.
- Database failure after the provider may have accepted the request but before success was durably recorded.
- A stale `IN_FLIGHT` action discovered by recovery.
- Cancellation during a provider call when acceptance cannot be ruled out.

An ambiguous action must:

- Persist safe error metadata when PostgreSQL is available.
- Produce a non-retryable workflow error.
- Avoid automatic re-execution.
- Never claim that Slack did or did not receive the message.

## Retry semantics

Connector policy classifies failures narrowly:

| Condition | Result |
|---|---|
| Cancellation before request begins | `CANCELLED`, no provider call |
| Missing, revoked, or mismatched credential | Non-retryable failure |
| Invalid input or unsupported operation | Non-retryable failure |
| Provider authentication/authorization failure | Non-retryable failure |
| Response-level 429 with bounded retry metadata | Retryable, capped by workflow policy |
| Provider-declared transient failure with proven no-side-effect semantics | Retryable, capped |
| Timeout or connection loss after dispatch may have occurred | `AMBIGUOUS`, never retry |
| Unknown 5xx result | `AMBIGUOUS`, never retry |
| Proven successful provider response | `SUCCEEDED` |

Existing `WORKFLOW_MAX_RETRIES` remains the upper bound. No retry loop may outlive the workflow step or total execution timeout.

## Failure and recovery matrix

| Situation | Durable result | Automatic action |
|---|---|---|
| Worker crashes before action row | No external call is known; workflow recovery may retry | Retry through existing worker path |
| Worker crashes after `IN_FLIGHT` claim | Call boundary uncertain | Mark stale action `AMBIGUOUS`; do not call again |
| Provider returns proven success | `SUCCEEDED` with bounded output | Complete workflow step |
| Provider succeeds but workflow completion write fails | Action remains `SUCCEEDED` if its write committed | Recover output and complete step without provider call |
| Provider succeeds but action write fails | External outcome unknown | Terminal `AMBIGUOUS` |
| Duplicate BullMQ delivery | Existing action row or workflow lease wins | No duplicate side effect |
| Credential revoked before call | No call | Non-retryable credential failure |
| Credential rotated while waiting | Current active material resolves at execution | Execute with current credential if active |
| Credential revoked during call | Current request cannot be undone | Record success or `AMBIGUOUS`; block future calls |
| Redis unavailable | Outbox remains durable | No provider call until dispatch recovers |
| PostgreSQL unavailable before call | No action claim | Do not call provider |
| PostgreSQL unavailable after call | Outcome cannot be recorded | Treat as `AMBIGUOUS` after recovery |
| Cancellation before call | `CANCELLED` | No provider call |
| Cancellation during call | `AMBIGUOUS` unless non-dispatch is proven | No automatic retry |
| Slack outage | Retry only declared safe responses | Otherwise fail or mark ambiguous |

## Authorization

Extend the centralized action union with:

```text
integration.read
integration.create
integration.update
integration.delete
integration.rotate_secret
integration.execute
```

Policy:

- OWNER: all actions.
- ADMIN: all actions.
- MEMBER: `integration.read` only.
- A user-initiated workflow containing an integration action requires `integration.execute`.
- Existing member workflow execution remains available for workflows without external actions.
- Scheduled and webhook executions use verified internal automation principals and may execute only the configured immutable binding.
- Automation principals cannot manage credentials, select a credential, or decide approvals.

Management routes always derive the user from Better Auth and resolve the resource workspace before applying the action check.

## Workspace isolation

Every credential and action query includes the workspace predicate.

Required invariants:

- Workspace A cannot list or read Workspace B credentials.
- Credential ID tampering cannot cross a workspace boundary.
- A workflow can bind only a credential from its own workspace.
- The credential connector must match the workflow connector.
- A run cannot use a revoked or deleted credential.
- Automation principal workspace, workflow, credential, and action records must agree.
- Public webhook input cannot select workspace, credential, connector, operation, or principal.

## Database and migration strategy

Modify `lib/database/schema.ts` and generate a new Drizzle migration. The migration must:

- Create `integration_credentials`.
- Create `integration_action_runs`.
- Add `INTEGRATION_ACTION` to the workflow step-run type check.
- Add status and positive-attempt checks.
- Add required indexes and unique constraints.
- Preserve all existing rows, versions, snapshots, webhook ciphertext, schedules, approvals, and layouts.

The generated SQL must be reviewed before execution. Run migrations against the existing database without resetting PostgreSQL, then verify the same migration path against a clean temporary database.

## API contracts

Authenticated management APIs:

```text
GET    /api/integrations/catalog
GET    /api/integration-credentials?workspaceId=<id>
POST   /api/integration-credentials
GET    /api/integration-credentials/:id
PATCH  /api/integration-credentials/:id
DELETE /api/integration-credentials/:id
POST   /api/integration-credentials/:id/rotate
```

Create request:

```json
{
  "workspaceId": "uuid",
  "connectorId": "slack",
  "name": "Marketing Slack",
  "secret": { "apiToken": "..." }
}
```

Safe response:

```json
{
  "credential": {
    "id": "uuid",
    "workspaceId": "uuid",
    "connectorId": "slack",
    "name": "Marketing Slack",
    "revokedAt": null,
    "lastUsedAt": null
  }
}
```

The secret is never returned, including in create or rotate responses. PATCH accepts safe metadata such as `name`; rotation accepts a replacement secret only through its dedicated authenticated route.

The catalog returns connector and operation display metadata, bounds, risk, and approval requirements only. It does not return credential schemas containing secret values or arbitrary endpoint controls.

## UI design

Add an Integrations/Credentials panel with:

- Static Slack catalog entry.
- Credential creation form.
- Token input that is cleared after submission.
- Safe status, name, connector, created time, and last-used time.
- Rotation and revoke/delete controls for OWNER/ADMIN.
- Read-only safe projections for MEMBER.

Extend the visual editor with:

- `INTEGRATION_ACTION` palette entry.
- Static Slack operation selector.
- Safe credential selector.
- Bounded channel and text expression fields.
- Approval-policy validation feedback.

The UI must not display or accept arbitrary URLs, methods, headers, ports, redirects, raw credentials, dynamic code, or connector modules. Advanced JSON uses the same server validation path as Canvas mode.

## Worker integration

Use the existing workflow worker and BullMQ job payload `{ runId }`.

The integration executor:

1. Receives trusted workflow execution context.
2. Resolves and validates the current credential inside the workspace.
3. Claims the durable logical action row.
4. Decrypts the credential only in worker memory.
5. Calls the static Slack executor through bounded egress.
6. Persists safe output and action metadata.
7. Returns bounded workflow output to the existing step completion path.

No secret enters BullMQ, workflow context, LLMProvider, BrandContext, AgentRunner, scheduler payloads, or public webhook handling.

## Audit rules

Add management actions:

```text
integration_credential.created
integration_credential.updated
integration_credential.rotated
integration_credential.revoked
integration_credential.deleted
```

Add safe execution actions:

```text
integration_action.started
integration_action.completed
integration_action.failed
integration_action.ambiguous
```

Safe metadata may include workspace, workflow/run/step IDs, connector, operation, credential ID, attempt, status, error code, provider request ID, and duration.

Never audit plaintext tokens, ciphertext, authorization headers, full external payloads, full provider responses, prompts, hidden reasoning, or raw error bodies.

## Egress and SSRF security

The internal egress primitive accepts a trusted connector request, not a URL supplied by a workflow. It enforces:

- Exact HTTPS Slack origin and path.
- Fixed `POST` method.
- No redirects (`redirect: "error"`).
- No user-selected port or hostname.
- Default TLS verification.
- Request and response byte limits.
- Request timeout and abort propagation.
- JSON content-type and bounded parsing.
- Provider error-code mapping and redaction.
- No arbitrary headers or HTTP agents.

Static provider allowlisting prevents workflow-driven SSRF. Deployment should additionally restrict worker egress to approved provider destinations. If safe DNS pinning cannot be implemented in a runtime, the request must fail closed rather than claim complete DNS-rebinding protection.

## Environment variables

Add server-only configuration for:

```text
INTEGRATION_EGRESS_ENABLED=false
INTEGRATION_CREDENTIAL_KEYRING_JSON
INTEGRATION_CREDENTIAL_CURRENT_KEY_VERSION=v1
INTEGRATION_REQUEST_TIMEOUT_MS=10000
INTEGRATION_MAX_REQUEST_BYTES=16384
INTEGRATION_MAX_RESPONSE_BYTES=65536
```

The keyring is required when creating or executing credentials. Development defaults must be clearly marked as local-only values. No integration secret is exposed through `NEXT_PUBLIC_*` variables or default Docker output.

## Docker and runtime implications

No new service is required. External egress occurs only from the trusted worker using the existing app image and Compose services.

The app and worker receive the integration configuration. Only the worker performs provider calls. Scheduler, PostgreSQL, Redis, and Ollama architecture remains unchanged.

Real connector tests require explicit internet access and opt-in environment credentials. Docker health checks must remain unchanged except for any required worker readiness validation.

## Testing strategy

Default deterministic tests use fake connector executors and injected bounded transport behavior. They must cover:

- Registry catalog and unknown connector/operation rejection.
- Strict Slack input/output schemas.
- Fixed endpoint/method/header/body construction.
- Redirect rejection, timeout, size, content-type, and error redaction.
- SecretBox key versions, rotation, invalid tags, and webhook compatibility.
- Credential CRUD, rotation, revocation, safe projections, and no plaintext response.
- Cross-workspace credential and workflow binding failures.
- Integration action state transitions and duplicate delivery.
- Success recovery after workflow completion failure.
- Stale in-flight actions becoming ambiguous.
- Timeout, connection loss, unknown 5xx, cancellation, and worker crash boundaries.
- Operation-policy approval path enforcement.
- Bounded approval preview with no credentials or hidden reasoning.
- AgentRunner non-exposure.
- API authorization and UI safe projections.
- Audit sanitization.
- Existing M1-M10 regression suites.

Real Slack tests are opt-in only, use environment-provided credentials and a dedicated test workspace/channel where practical, never run in default CI, and never include tokens in source, logs, audit records, or error responses.

## M1-M10 compatibility

M11 must preserve:

- All existing workflow definitions and immutable snapshots.
- Existing six step behavior and workflow graph semantics.
- Existing scheduler, webhook, approval, outbox, BullMQ, worker, and lease behavior.
- Existing webhook ciphertext and key configuration.
- Existing AI/RAG/LLMProvider boundaries.
- Existing controlled AgentRunner and static tools.
- Existing visual layout isolation and optimistic editor concurrency.
- Existing migrations and PostgreSQL data.
- Existing Docker volumes and service topology.

The only existing executable constraint that expands is the workflow step-run type check to include `INTEGRATION_ACTION`. No existing data should require rewriting.

## Explicit M12 exclusions

M12 must not include, unless separately specified and approved:

- Arbitrary generic HTTP.
- Browser automation.
- Broad OAuth brokerage.
- Gmail, Shopify, or LinkedIn.
- Integration marketplace.
- User-written connector code.
- Dynamic modules or plugins.
- Shell, SQL, or filesystem access.
- File uploads.
- Multi-agent orchestration.
- Billing.
- Quotas.
- Production deployment.
- Public approval links.

## Implementation boundary

This design authorizes a future M11 implementation following the companion implementation plan. It does not authorize M12, generic network capabilities, or unrelated dependency upgrades.
