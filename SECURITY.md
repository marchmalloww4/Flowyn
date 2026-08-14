# Security

## Implemented controls

- Better Auth password authentication and database-backed sessions.
- Server-side session lookup for protected routes.
- Server-side workspace membership checks for workspace and brand operations.
- Zod validation for workspace, brand, and AI request bodies.
- 404 responses for resources outside the authenticated user’s workspace.
- Secrets kept in server environment variables and excluded from Git.
- Provider errors sanitized so connection URLs and credentials are not returned.
- Prompt length and generation token bounds.
- AI generation requires authenticated workspace membership; optional brand context is checked against the same workspace.
- AI provider configuration is server-side only; clients cannot select arbitrary endpoints or models.
- Generation logs store operational metadata only and exclude prompts, responses, credentials, URLs, and stack traces.
- Knowledge documents and chunks are workspace- and brand-scoped with server-side authorization and cascading ownership foreign keys.
- Semantic retrieval applies workspace and brand filters inside SQL before limiting results and never returns embeddings.
- Retrieved knowledge is delimited as untrusted prompt data and is never placed in the system instruction.
- Structured AI output is parsed and validated with Zod before application use.
- No shell execution, arbitrary code execution, or generic database tool is exposed to AI.
- Docker services use named volumes and explicit healthchecks.
- Agent definitions and runs are workspace-authorized; `agent.write`/`agent.delete` are restricted to admins/owners while members may read and run enabled definitions.
- Agent DELETE is a soft delete (`deletedAt` plus `enabled = false`), preserving historical runs and steps.
- Agent run bodies contain only a bounded goal. User, workspace, agent, brand, tool, policy, and abort context are derived server-side.
- The effective tool set is the intersection of configured names, registered tools, and tools valid for the trusted runtime brand. No shell, filesystem, SQL, arbitrary HTTP, browser, dynamic code, or external integration tool is registered. M11's Slack operation is a static workflow connector, not an AgentRunner tool.
- Model observations are bounded, escaped, and delimited as untrusted prompt data. Persisted step rows contain only safe summaries; hidden reasoning and raw tool output are not requested or stored.
- Agent execution has hard step, model-call, tool-call, total-time, observation, goal, and final-response bounds. Request aborts use `AbortSignal`; durable cross-request cancellation is intentionally deferred.

## Visual workflow editor security

- The editor is a projection of the existing `WorkflowDefinition`; `@xyflow/react` never executes client graph data. The server re-parses the complete definition, checks the static seven-step registry, graph reachability/cycle/reference rules, and referenced agent/brand/integration-credential ownership on every executable save, including disabled workflows.
- GET and PATCH use the existing Better Auth session and centralized workspace authorization. A client-supplied workflow ID or layout workspace/version ID is never sufficient for access; workflow and layout reads include the authorized workflow workspace predicate.
- `workflow_editor_layouts` contains only bounded coordinates and viewport values. It excludes executable config, prompts, credentials, raw inputs, tool output, and secrets; it does not affect definition hashes, snapshots, scheduler/webhook/approval state, or execution.
- Definition and layout saves use the PostgreSQL-authoritative `currentVersionId` token and a row lock. A stale token returns `WORKFLOW_VERSION_CONFLICT` (409), so concurrent editors cannot silently overwrite a newer executable version. Failed or conflicting saves retain unsaved client state.
- Advanced JSON and Canvas use the same server PATCH path. The UI performs no dynamic imports, `eval`, `Function`, shell, SQL, filesystem, arbitrary HTTP, browser automation, or user-selected executable module loading. Node labels/configuration are rendered as text or bounded JSON.

Workflow definitions, request bodies, inputs, references, step configs, and idempotency keys are strict and bounded. Reference paths reject __proto__, prototype, and constructor. Workflow access is workspace-scoped: members may cancel only runs they started, while admins and owners may cancel any cancellable run in their workspace, including scheduled runs whose startedBy is NULL.

Workflow versions and run snapshots are immutable. External agent and brand IDs are re-resolved at execution and must still belong to the workspace; disabled or deleted agents cannot run. Workflow execution uses a static server registry and cannot invoke eval, Function, dynamic modules, shell, arbitrary SQL, filesystem access, arbitrary HTTP, browser automation, or user-selected tools.

Durable workflow output is schema-controlled JSON separate from safe observability metadata. History excludes chain-of-thought, raw observations, credentials, and unrestricted tool data. PostgreSQL execution tokens and leases guard every step and run transition; stale recovery creates a new attempt and prevents an old worker from completing after lease loss.

## Human approval security

- Approval policy is read only from the immutable workflow definition snapshot and copied into a workspace-scoped request. Client roles, workflow input, webhook payloads, AI output, RAG content, agent decisions, and automation principals cannot grant approval authority.
- Better Auth and the centralized `workflow_approval.read`/`workflow_approval.decide` actions protect all approval routes. Members can read safe projections; the decision service re-checks the current membership and role inside the PostgreSQL decision transaction. OWNER is required for OWNER policy; ADMIN or OWNER satisfies ADMIN policy. Self-approval is intentionally allowed in M9.
- PostgreSQL locks and conditional `PENDING` transitions make approval/rejection/expiration/cancellation races first-commit-wins. Repeated identical decisions are idempotent; opposite or late decisions receive safe conflicts. Approval output is exactly `{ "decision": "approved" }`.
- Waiting releases worker execution tokens and leases. Approval continuation increments durable dispatch generation and reuses the existing outbox/BullMQ path. Duplicate jobs cannot rerun completed steps because PostgreSQL run claims and step state remain authoritative.
- The inbox stores only bounded workflow/step names, IDs, version, role, origin kind, timestamps, and operational counts. It never stores or returns raw input, full webhook payloads, prompts, hidden reasoning, unrestricted observations, credentials, or secrets. Expiration uses bounded scheduler maintenance plus a lazy authoritative decision check.

## Scheduling security

- Workflow schedules and occurrences are workspace-owned, validated server-side, and claimed with PostgreSQL row locks plus a unique schedule/instant constraint. Scheduler heartbeats are liveness metadata only; Redis is not schedule truth.
- Schedule mutation is restricted to workspace admins/owners; members may read schedule history. CRON is five-field and timezone-aware, intervals are bounded, one-time schedules are terminal, and misfire handling is bounded by server policy.
- Scheduled workflow runs use a verified workspace automation principal, never a fake user. startedBy, generation log user IDs, subordinate agent starter IDs, and scheduler audit actors remain nullable for automation.
- Scheduled AI/Agent execution reuses the existing LLMProvider, BrandContext/RAG, and deny-by-default AgentRunner. Client input cannot choose a schedule principal, workspace, user, provider endpoint, model, tool, SQL query, shell command, filesystem path, or arbitrary HTTP target.

## Webhook security

- Webhook public IDs are generated from 32 cryptographically secure random bytes and are not credentials. The secret is generated separately, encrypted at rest with versioned AES-256-GCM, and returned only once on create/rotate.
- Public delivery requires `X-Flowyn-Timestamp` and `X-Flowyn-Signature: v1=<hex HMAC-SHA256>`. The signed message is the exact timestamp plus raw body bytes; verification uses a constant-time digest comparison and a bounded replay window.
- Raw bodies, JSON inputs, event IDs, nested values, content lengths, and history pages are bounded. JSON roots must be objects and the final input is validated by the existing workflow run schema. Reserved workspace/user/workflow/principal/role/tool/model/endpoint/control fields cannot select execution capabilities.
- Redis provides global and per-trigger admission limits and public ingress fails closed if Redis is unavailable. PostgreSQL remains authoritative for event deduplication, duplicate updates, event retention, workflow runs, and outbox dispatch.
- The public request may address only the configured trigger. It cannot choose a workspace, user, workflow, role, principal, agent, tool, model, endpoint, SQL, shell, filesystem, code, or outbound request. It never directly executes a workflow or calls Ollama.
- Event history and audit logs store only safe identifiers, hashes, sizes, status, reason codes, duplicate counts, and run links. Raw bodies, headers, signatures, and secret material are not persisted. Existing bounded workflow input history remains workspace data; senders must not include credentials in webhook payloads.
- Webhook automation reuses the existing non-forgeable workspace automation principal with a trigger/event origin, the existing workflow snapshot/outbox/BullMQ/worker path, and the same AgentRunner, RAG, and LLMProvider boundaries. No fake user or second execution engine exists.

## Outbound integration security

- Integration credentials are workspace-scoped, encrypted with a separate purpose-aware AES-256-GCM keyring, and returned only as safe metadata. Secret material and ciphertext never enter workflow definitions, immutable snapshots, queues, browser responses, AI/RAG/AgentRunner context, audit metadata, or logs.
- OWNER and ADMIN users manage credentials; MEMBER users can read safe projections only. Workflow execution resolves the credential by both workspace and static connector ID. User-initiated runs with an integration step require `integration.execute`; automation principals cannot manage credentials, select bindings, or decide approvals.
- The only outbound target is the fixed HTTPS Slack `chat.postMessage` endpoint with a fixed POST method, server-generated headers, redirect rejection, bounded body/response sizes, JSON parsing, and timeout/abort handling. Workflows and clients cannot supply URLs, hosts, ports, methods, headers, redirects, arbitrary bodies, or dynamic code.
- Slack `post_message` is side-effecting and requires an `APPROVAL` step on every reachable workflow path. PostgreSQL action rows claim the logical run/step before egress, recover proven success without duplicate calls, and classify unknown outcomes as terminal `AMBIGUOUS` with no automatic retry. AgentRunner receives no integration tools.

## Credential handling

Never commit `.env.local`, database passwords, or provider secrets. The Compose defaults are development-only values. Replace `BETTER_AUTH_SECRET` before using a shared development machine.

## Workspace isolation rule

A resource ID is not an authorization decision. A protected service must:

1. Derive the user from the server session.
2. Resolve the resource and its owning workspace.
3. Verify active workspace membership.
4. Only then read or mutate the resource.

## Deferred controls

Generic SSRF-safe HTTP, arbitrary outbound integrations, OAuth, third-party credential brokerage, CSRF policy review, file validation, uploads, external approval channels, browser automation, billing, and marketplace features remain deferred. M11 provides only encrypted workspace credentials and the fixed Slack `post_message` target; it must not be generalized into a generic HTTP client.

## Local AI boundary

Ollama is reachable on the local network by design. Generation and embedding routes use only trusted server configuration; users cannot select arbitrary model or endpoint URLs. The generation and knowledge routes require authenticated workspace access, do not allow model command execution, and do not expose raw provider errors or embeddings. Native streaming forwards text only.

## Reporting issues

Do not include secrets in issue reports. Include the route, error code, reproduction steps, and whether the issue occurs with host or Compose networking.
