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
- The effective tool set is the intersection of configured names, registered tools, and tools valid for the trusted runtime brand. No shell, filesystem, SQL, arbitrary HTTP, browser, dynamic code, or external integration tool is registered.
- Model observations are bounded, escaped, and delimited as untrusted prompt data. Persisted step rows contain only safe summaries; hidden reasoning and raw tool output are not requested or stored.
- Agent execution has hard step, model-call, tool-call, total-time, observation, goal, and final-response bounds. Request aborts use `AbortSignal`; durable cross-request cancellation is intentionally deferred.

Workflow definitions, request bodies, inputs, references, step configs, and idempotency keys are strict and bounded. Reference paths reject __proto__, prototype, and constructor. Workflow access is workspace-scoped: members may cancel only runs they started, while admins and owners may cancel any cancellable run in their workspace, including scheduled runs whose startedBy is NULL.

Workflow versions and run snapshots are immutable. External agent and brand IDs are re-resolved at execution and must still belong to the workspace; disabled or deleted agents cannot run. Workflow execution uses a static server registry and cannot invoke eval, Function, dynamic modules, shell, arbitrary SQL, filesystem access, arbitrary HTTP, browser automation, or user-selected tools.

Durable workflow output is schema-controlled JSON separate from safe observability metadata. History excludes chain-of-thought, raw observations, credentials, and unrestricted tool data. PostgreSQL execution tokens and leases guard every step and run transition; stale recovery creates a new attempt and prevents an old worker from completing after lease loss.

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

## Credential handling

Never commit `.env.local`, database passwords, or provider secrets. The Compose defaults are development-only values. Replace `BETTER_AUTH_SECRET` before using a shared development machine.

## Workspace isolation rule

A resource ID is not an authorization decision. A protected service must:

1. Derive the user from the server session.
2. Resolve the resource and its owning workspace.
3. Verify active workspace membership.
4. Only then read or mutate the resource.

## Deferred controls

SSRF protection, encrypted integration credentials, CSRF policy review, file validation, safe expression evaluation, and approval gates belong to later milestones because those surfaces do not exist yet. They must be implemented before HTTP tools, uploads, or external integrations are enabled.

## Local AI boundary

Ollama is reachable on the local network by design. Generation and embedding routes use only trusted server configuration; users cannot select arbitrary model or endpoint URLs. The generation and knowledge routes require authenticated workspace access, do not allow model command execution, and do not expose raw provider errors or embeddings. Native streaming forwards text only.

## Reporting issues

Do not include secrets in issue reports. Include the route, error code, reproduction steps, and whether the issue occurs with host or Compose networking.
