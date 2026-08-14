# Milestone 12 — Production Hardening, Usage Limits & Observability

**Status:** Approved design specification. Documentation only; implementation is not authorized by this document.

**Date:** 2026-08-15

**Authoritative architecture:** `MILESTONE 12 PRODUCTION HARDENING ARCHITECTURE — FINAL`

## Objective

Prepare the existing M1–M11 Flowyn modular monolith for safer multi-tenant production use without adding a major product capability. M12 adds centralized workspace usage policy, durable quota admission, bounded rate limiting, PostgreSQL-authoritative concurrency reservations, operational observability, readiness diagnostics, bounded cleanup, production configuration validation, and safer failure classification.

The implementation must preserve existing authentication, authorization, workspace isolation, AI/RAG, agent, workflow, scheduler, webhook, approval, editor, credential, and Slack behavior.

## Non-goals

M12 does not add:

- billing, subscriptions, Stripe, checkout, pricing, or paid plans
- a workspace plan column or plans table
- Prometheus, Grafana, a metrics dependency, or a public platform metrics endpoint
- new outbound connectors, generic HTTP, OAuth, or unrestricted egress
- browser automation, file uploads, plugins, marketplace features, or user-written code
- multi-agent orchestration
- cloud deployment, Terraform, Kubernetes, DNS, TLS, CDN, managed PostgreSQL, managed Redis, or hosted Ollama
- automatic deletion of audit/security history, approvals, credential lifecycle history, AMBIGUOUS actions, workflow history, agent history, knowledge, or workflow definitions

## Repository baseline and integration map

The repository is clean at `3f19b82 feat: add secure outbound integrations`, with M1–M11 committed and synchronized. The implementation review found no architecture contradiction. The following concrete mappings govern implementation:

| M12 concern | Existing integration point | M12 change | Boundary preserved |
| --- | --- | --- | --- |
| Plan resolution and limits | `lib/env.ts`, `lib/workflows/policy.ts`, `lib/agents/policy.ts`, `lib/webhooks/policy.ts`, `lib/integrations/policy.ts` | Add `WorkspacePlanResolver` and `WorkspaceUsagePolicy`; keep operational constants centralized | No billing or scattered route constants |
| Durable state | `lib/database/schema.ts`, `lib/database/client.ts`, `lib/database/migrate.ts` | Add usage, admission, and concurrency tables; extend outbox metadata; generate the next Drizzle migration | PostgreSQL remains authoritative |
| Workflow dispatch | `lib/workflows/outbox.ts`, `lib/workflows/queue.ts`, `lib/workflows/worker.ts` | Defer a claimed dispatch back to `PENDING` when a workspace slot is unavailable; keep `DISPATCHED` as the existing success state | Existing outbox/BullMQ path only |
| Workflow execution | `lib/workflows/service.ts`, `lib/workflows/executor.ts` | Acquire/release workspace reservation around existing PostgreSQL execution lease; keep guarded tokens and stale recovery | No second execution engine |
| AI | `lib/ai/service.ts`, `lib/ai/generation-log.ts`, `app/api/ai/generate/route.ts` | Admit logical generations before provider calls; record only bounded metadata | `LLMProvider` remains the provider boundary |
| Agents | `lib/agents/service.ts`, `lib/agents/runner.ts`, `app/api/agents/[id]/runs/route.ts` | Admit agent starts and logical model decisions; preserve `AgentRunner` and safe tools | No new agent runtime |
| Webhooks | `lib/webhooks/ingress.ts`, `lib/webhooks/rate-limit.ts`, `lib/webhooks/repository.ts`, `lib/webhooks/retention.ts` | Reuse Redis rate limiting and count only newly inserted unique events durably | M8 encryption, replay, and deduplication remain authoritative |
| Scheduling | `lib/schedules/scheduler.ts`, `lib/schedules/processor.ts`, `worker/workflow-scheduler.ts` | Enforce active schedule limits and add bounded generation/scheduler cleanup to existing maintenance | Scheduler remains PostgreSQL-authoritative |
| Integrations | `lib/integrations/actions.ts`, `lib/workflows/executors/integration-action.ts`, `lib/integrations/policy.ts` | Admit action roots and concurrency; preserve operation policy and terminal ambiguity | Slack `post_message` remains the only connector operation |
| Authorization | `lib/authz/authorization.ts`, `lib/auth/session.ts`, `lib/memberships/service.ts` | Add an OWNER/ADMIN-only operations-read action | Existing central authorization remains authoritative |
| Errors | `lib/security/errors.ts`, `lib/http.ts` | Add typed quota, rate, concurrency, and infrastructure categories; use redacted structured logging | Responses remain typed and secret-free |
| Audit | `lib/audit/service.ts` | Add allowlisted correlation IDs and bounded operational events | Existing sanitization and audit history remain |
| Health | `lib/health/checks.ts`, `lib/health/types.ts`, `app/api/health/route.ts` | Preserve liveness and add `/api/health/ready` with core/degraded-AI states | No sensitive diagnostics leak |
| UI | `app/(dashboard)/dashboard/page.tsx`, existing panel components | Add workspace operations/usage presentation for OWNER/ADMIN | No global admin or billing UI |
| Verification | `scripts/verify-local.ps1`, `tests/` | Check current and clean temporary PostgreSQL databases plus M12 race/security cases | M1–M11 checks remain mandatory |

## Usage-policy model

Add a server-only `WorkspacePlanResolver` that returns `SELF_HOSTED` for every workspace in M12. The resolver is intentionally an interface-shaped service so a future durable plan source can replace it without changing quota enforcement. M12 does not persist plan assignment.

`WorkspaceUsagePolicy` is the only source for M12 limits. Routes and domain services receive resolved policy values; they do not embed numeric constants. Any environment override is parsed in `lib/env.ts`, checked against hard safety bounds, and exposed through the policy module only.

### Initial SELF_HOSTED limits

These values are operational defaults, not pricing or capacity guarantees:

| Metric | Limit |
| --- | ---: |
| AI generations | 30/minute and 500/day |
| Concurrent agents | 2 |
| Agent runs | 120/day |
| Concurrent workflows | 10 |
| Workflow starts | 60/minute and 1,000/day |
| Accepted unique webhooks | 300/minute per workspace, in addition to existing M8 global/trigger limits |
| Active schedules | 50 |
| Knowledge documents | 100 |
| Knowledge characters | 10,000,000 |
| Integration credentials | 20 |
| Concurrent integration actions | 2 |
| Integration actions | 30/minute and 300/day |

There is no separate M12 public AI concurrency quota. Direct AI calls use the durable admission and request timeout policy; agent, workflow, and integration execution use the concurrency reservation system.

## Durable quota and admission transaction

Add compact PostgreSQL tables:

### `workspace_usage_buckets`

Stores durable counters keyed by workspace, metric, and bucket start. The unique key is `(workspace_id, metric, bucket_start)`. Counters are integer units and have bounded timestamps.

### `workspace_usage_admissions`

Stores one durable logical admission per `(workspace_id, metric, operation_key)`. It stores source type, source ID where available, bucket start, units, and timestamps. It never stores prompts, responses, credentials, webhook bodies, workflow outputs, or provider payloads.

Admission is performed in one PostgreSQL transaction:

1. Authenticate, authorize, validate, and apply Redis short-window admission where required.
2. Insert the logical admission with `ON CONFLICT DO NOTHING`.
3. If the key already exists, return the existing logical admission without incrementing a counter.
4. If it is new, upsert the durable bucket using a conditional `consumed + units <= limit` update.
5. If the conditional update returns no row, roll back the admission and return a quota error.
6. Commit the root operation and its admission together whenever the operation creates a durable root row.

PostgreSQL row locks and the unique admission key serialize races. A rejected quota request leaves no durable admission. A Redis token consumed before a later PostgreSQL rejection may expire naturally in its bounded window; it never bypasses the durable quota.

## Operation-key and idempotency strategy

Operation keys are stable logical identities, not request timestamps:

- Direct workflow runs reuse the existing workspace-scoped workflow `idempotency-key`; the generated `workflow_runs.id` is the fallback source identity.
- Scheduled runs use the unique schedule occurrence identity and resulting workflow run identity.
- Webhook quota admission occurs only after M8 HMAC, replay, payload, and PostgreSQL deduplication. The unique `(trigger_id, dedupe_key)` event row is the durable source identity. Duplicate deliveries update `duplicate_count` but do not create an admission.
- Direct agent starts use the created `agent_runs.id`; the direct run endpoint accepts a validated `Idempotency-Key` in M12 so a lost HTTP response can be retried without creating a second run.
- Direct AI requests use a validated `Idempotency-Key` when supplied. Without one, each admitted request is a distinct logical generation. A server-created admission ID is used as the safe source identity.
- Workflow AI steps use `workflow_run_id:step_id`, so workflow step retries do not create additional AI quota admissions.
- Agent model decisions use `agent_run_id:step_number`, so a retry of the same logical decision does not double-count.
- Integration actions reuse the existing unique `(workflow_run_id, workflow_step_id)` and `idempotency_key` identity.
- Knowledge admission is keyed by document creation/update identity and counts only accepted content.
- Active schedule and credential limits are checked against current durable state, not usage buckets.

BullMQ retries, workflow step retries, agent retries, stale-worker recovery, and retryable integration failures reuse the same logical key. An intentional new user operation receives a new key and may consume a new unit.

## Redis/PostgreSQL authority boundaries

Redis remains the fast fixed-window limiter for abuse protection. It uses atomic increment/expiry operations and workspace/operation keys. It is not the source of truth for daily quotas, webhook deduplication, workflow state, or concurrency.

PostgreSQL is required for every durable quota admission and all concurrency reservation transitions. Redis restart or key loss can reset only short rate windows; it cannot reset or bypass daily durable usage.

Redis outage behavior:

- Direct AI, agent, workflow-start, integration, credential-security, and public webhook operations fail closed before the expensive or external side effect.
- Existing webhook `WEBHOOK_RATE_LIMIT_UNAVAILABLE` behavior remains compatible.
- Existing queued workflow dispatch remains durable in PostgreSQL and is deferred until Redis/BullMQ is available.
- Safe read-only summaries may return PostgreSQL data with Redis live fields marked degraded.

PostgreSQL outage behavior:

- No expensive operation starts because it cannot obtain authoritative admission or concurrency state.
- No outbound integration call starts.
- Existing durable records are not marked failed merely because a diagnostic or dispatcher probe is unavailable.
- Readiness becomes not ready for the core application.

## Rate-limit policies

M12 reuses `lib/webhooks/rate-limit.ts` as the implementation pattern and adds a generic internal workspace limiter with the same atomic/fail-closed contract. Limits are keyed by workspace and operation class, with fixed minute buckets and bounded expiry.

The following are rate-limited:

- AI generation requests
- agent starts
- workflow starts
- integration actions
- webhook ingress, retaining existing global and per-trigger limits
- credential lifecycle operations where abuse could expose encrypted material or cause churn

Rejected requests do not create durable usage admissions. Raw rejected webhook requests may count in Redis for abuse protection, as required by M8.

## Concurrency reservation state machine

Add PostgreSQL-authoritative state and lease rows keyed by workspace and operation class.

Reservation lifecycle:

```text
AVAILABLE -> RESERVED -> RENEWED -> RELEASED
                         |
                         +-> EXPIRED -> REAPED
```

- `acquire`: lock workspace/class state, reap expired rows, compare active count to policy, and insert a unique reservation.
- `renew`: extend only when reservation ID and owner match and the lease is still valid; renew before half the TTL.
- `release`: idempotently release by reservation ID and owner on terminal completion, cancellation, failure, or approval pause where execution is no longer active.
- `expiration`: an expired reservation no longer counts; a later acquisition or bounded scheduler maintenance reaps it.
- crash behavior: a crashed worker stops renewing, then its reservation expires. Existing workflow execution-token guards prevent the stale worker from completing the run.

Workflow dispatch reservations are safe bounded handoff leases. The reservation lifetime must cover dispatch latency and initial worker adoption. If a dispatched job finds its handoff reservation expired while the workflow is still `QUEUED`, it performs a guarded PostgreSQL transition that increments `dispatch_generation`, returns the dispatch row to `PENDING`, applies bounded delay, and exits without executing the workflow. It never marks the workflow failed.

## Workflow outbox deferral semantics

The existing dispatch state is:

```text
PENDING -> CLAIMED -> DISPATCHED
             |
             +-> FAILED
```

M12 adds `next_attempt_at`, `defer_count`, and a bounded `defer_reason` to `workflow_run_dispatches`. The existing `DISPATCHED` status remains the successful enqueue state; it is not renamed to `SENT`.

New transitions:

```text
PENDING/FAILED-ready -> CLAIMED
CLAIMED              -> PENDING       (workspace slot unavailable)
CLAIMED              -> DISPATCHED    (reservation acquired and BullMQ enqueue accepted)
CLAIMED              -> FAILED        (actual enqueue/dispatch error)
stale CLAIMED        -> PENDING       (existing lease recovery)
DISPATCHED           -> PENDING       (guarded handoff-expiry recovery only)
```

Concurrency deferral:

- does not increment dispatch failure attempts
- increments only the separate defer counter
- sets bounded exponential `next_attempt_at` with a cap
- keeps the workflow run `QUEUED`
- does not create another queue
- does not busy-loop
- preserves fair ordering and bounded per-workspace dispatch share

Actual enqueue failures use the existing bounded dispatch retry policy. BullMQ job IDs remain deterministic by run ID and dispatch generation. Job payloads contain only run ID, reservation ID, generation, and correlation ID.

## Correlation propagation

Add a validated request correlation helper, preferably using explicit context rather than a mutable global. The flow is:

```text
HTTP request
  -> root operation
  -> workflow run / agent run / generation / integration action
  -> workflow outbox
  -> BullMQ job
  -> executor and provider call
  -> audit event and structured log
```

Incoming `X-Request-ID` is accepted only after length and character validation; otherwise the server generates a UUID. Correlation IDs are safe operational identifiers and are never authorization credentials.

Nullable correlation columns may be added to operational root tables and outbox rows. Existing records remain valid with null correlation IDs. Queue payloads and audit metadata contain only the correlation ID, never sensitive context.

## Structured logging and redaction contract

Add a small dependency-free structured logger and a shared redaction function. Log records may contain:

- event name
- request/correlation ID
- workspace ID when safe
- operation class
- source/root ID
- status
- duration
- bounded error code
- retry or defer reason

The redactor removes keys matching secret, token, credential, password, authorization, cookie, prompt, response, body, content, and provider-payload patterns. It bounds object depth, array length, serialized size, and string length.

`lib/security/errors.ts` must stop logging raw unknown exception objects. Unhandled errors use the redacted logger with error name/code only. Audit metadata continues through `sanitizeAuditMetadata` and may add the safe correlation ID.

## Readiness, liveness, and degraded AI

Preserve:

```text
GET /api/health
```

as a process liveness check returning the existing safe response.

Add:

```text
GET /api/health/ready
```

Readiness checks production configuration, PostgreSQL, Redis, and migration state. Ollama is an optional capability check:

- `ready`: core dependencies are available and Ollama is available
- `degraded`: core dependencies are available but Ollama/model readiness is unavailable
- `not_ready`: core configuration, PostgreSQL, Redis, or migration readiness is unavailable

The response contains bounded status and error codes only. It exposes no connection strings, host details, secrets, stack traces, or model credentials.

Existing Docker health checks continue using liveness unless an explicitly reviewed runtime change is required.

## Workspace operations and usage projections

Add OWNER/ADMIN-only workspace APIs:

```text
GET /api/workspaces/:id/usage
GET /api/workspaces/:id/operations
```

Both routes authenticate with Better Auth, call the existing centralized authorization service, and scope every query by the authorized workspace ID.

Usage projection fields:

- plan label `SELF_HOSTED`
- metric, limit, consumed, remaining, and reset time
- active concurrency counts
- bounded recent rate-limit/quota rejections

Operations projection fields:

- recent workflow, agent, AI, webhook, and integration status counts
- outbox pending/claimed/failed counts
- worker and scheduler heartbeat age
- bounded retry/defer summaries
- optional degraded dependency state

All queries use validated time ranges, indexed predicates, fixed maximum rows, and bounded aggregates. No endpoint scans unbounded history or exposes raw operation payloads.

Members receive the existing non-leaking forbidden/not-found behavior. No global SaaS super-admin endpoint or UI exists.

## Retention classes and cleanup

| Class | Data | M12 policy |
| --- | --- | --- |
| Short-lived operational | `generation_logs`, `workflow_schedule_occurrences` | Delete after 30 days in bounded batches |
| Existing ingress metadata | `workflow_webhook_events` | Preserve existing configurable 30-day behavior and cleanup |
| Security/audit | `audit_logs`, approval decisions, credential lifecycle, AMBIGUOUS actions | Never automatically delete in M12 |
| User-owned history | workflows, versions, runs, agent runs, knowledge | Never automatically delete in M12 |
| Compact usage dedupe | `workspace_usage_admissions` | Reap only safe terminal source keys outside the retry horizon; never delete active or unresolved keys |

Cleanup is added to the existing `worker/workflow-scheduler.ts` maintenance callback. Each cleanup function uses an indexed expiry/created-at predicate, a fixed batch limit, idempotent deletion, and safe continuation after interruption.

## Production configuration validation

`lib/env.ts` remains the central parser. Strict production checks run only for `NODE_ENV=production` and reject:

- the current Better Auth placeholder secret
- placeholder webhook encryption keys
- placeholder integration keyrings
- invalid key versions or missing current key material
- localhost public URLs
- invalid M12 limit, retention, timeout, or backoff overrides

Development and test defaults, including Docker Compose `NODE_ENV: development`, remain unchanged. No new production-only requirement is evaluated in local development or tests.

## Authorization and workspace isolation

Add a centralized action such as `workspace.operations.read` to `lib/authz/authorization.ts`:

- OWNER: allowed
- ADMIN: allowed
- MEMBER: denied

Every usage/admission/reservation/projection query includes workspace scope. Internal `WORKSPACE_AUTOMATION` principals remain non-forgeable and capability-limited. The operations APIs are human workspace APIs and are not exposed to automation principals.

## Failure categories

Add typed categories while preserving existing specific error codes:

- `VALIDATION`
- `AUTHENTICATION`
- `AUTHORIZATION`
- `RATE_LIMIT`
- `QUOTA`
- `CONCURRENCY`
- `PROVIDER`
- `INFRASTRUCTURE`
- `TIMEOUT`
- `AMBIGUOUS_EXTERNAL_SIDE_EFFECT`
- `INTERNAL`

The HTTP response layer maps these to stable safe codes and messages. Logs retain bounded diagnostic detail; browser responses do not.

## Retry invariants

- Durable admission occurs once per logical operation key.
- BullMQ retries do not create new workflow-start or agent-start admissions.
- Workflow step retries reuse logical step keys for usage accounting.
- Agent retries reuse logical run/step keys.
- Webhook duplicates rejected by PostgreSQL deduplication do not consume accepted-event quota.
- Stale-worker recovery reuses the same workflow root and admission.
- Retryable integration errors reuse the existing integration action row and idempotency key.
- `AMBIGUOUS` integration outcomes remain terminal and are never automatically retried.
- The existing `integrationActionRuns` state machine and `executeIntegrationAction` classification remain authoritative.

## Schema and migration design

The future implementation will update `lib/database/schema.ts` and generate the next migration with `npm run db:generate`. No migration is created during this documentation phase.

Expected additions:

- `workspace_usage_buckets`
- `workspace_usage_admissions`
- workspace/class concurrency state
- concurrency lease rows
- nullable correlation IDs on operational root and dispatch records where needed
- `next_attempt_at`, `defer_count`, and bounded `defer_reason` on workflow dispatches
- retention and operations indexes

The migration must be generated and reviewed, applied to the existing PostgreSQL database, then applied to a clean temporary database. Existing M1–M11 rows and volumes must remain intact.

## Justified indexes

Expected indexes are:

- unique usage bucket `(workspace_id, metric, bucket_start)`
- unique usage admission `(workspace_id, metric, operation_key)`
- usage admissions `(workspace_id, created_at)` for bounded cleanup
- concurrency state `(workspace_id, operation_class)` unique
- concurrency leases `(workspace_id, operation_class, expires_at)`
- dispatch readiness `(status, next_attempt_at, created_at)`
- correlation lookup indexes only where operations projections require them
- existing `generation_logs_workspace_created_idx`, `workflow_schedule_occurrences_workspace_idx`, and webhook expiry index retained and reused

Indexes must serve a demonstrated bounded query or atomic uniqueness requirement; no broad speculative indexes are added.

## API contracts

### Readiness

`GET /api/health/ready` returns a safe object containing overall status and per-check status/error code. It does not require a session because it is an operational probe.

### Workspace usage

`GET /api/workspaces/:id/usage` accepts a validated optional time window bounded to the supported operational range and returns only the authorized workspace’s policy and counters.

### Workspace operations

`GET /api/workspaces/:id/operations` accepts bounded `from`, `to`, and `limit` parameters. It returns safe aggregate status counts and dependency/queue summaries, not raw rows or payloads.

### Direct AI and agent idempotency

Direct AI generation and agent-run start routes accept an optional validated `Idempotency-Key` header. Existing workflow and integration idempotency behavior remains unchanged.

## UI design

Add a workspace operations/usage panel to the existing dashboard shell rather than introducing a global administration area. The panel is visible only after an authorized workspace context is selected and shows:

- usage bars and reset times
- active concurrency
- recent safe failures and deferred dispatches
- worker/scheduler/readiness state
- degraded Ollama status

It never renders secrets, credentials, prompts, responses, webhook bodies, raw provider data, or billing controls.

## Worker and scheduler changes

The worker continues to run `startWorkflowWorker`, `executeWorkflowRun`, and `dispatchPendingWorkflowRuns`. It adds reservation handoff and safe correlation propagation without changing the static step registry.

The scheduler continues PostgreSQL-authoritative schedule processing and Redis heartbeat behavior. Its maintenance callback gains bounded generation-log, scheduler-occurrence, usage-dedupe, and stale-reservation cleanup while retaining webhook and approval cleanup.

Worker and scheduler startup/readiness errors use structured redacted logs. Existing heartbeat health scripts remain compatible.

## Docker and runtime implications

No new service, port, volume, or dependency is required. PostgreSQL, Redis, Ollama, app, worker, and scheduler remain the existing Compose architecture. Development environment values remain unchanged. Production validation is conditional on `NODE_ENV=production`.

## Security threat review

Threats addressed:

- quota races: PostgreSQL conditional updates and unique admission keys
- Redis reset bypass: PostgreSQL durable daily counters remain mandatory
- workspace leakage: central authorization plus workspace predicates on every query
- denial-of-service: bounded Redis rate limits, concurrency leases, and queue deferral
- retry amplification: logical operation keys and separate dispatch/defer counters
- stale-worker execution: existing workflow execution tokens plus workspace lease expiry
- secret exposure: structured redaction, safe projections, existing encrypted vault, and no raw provider logging
- readiness information disclosure: bounded status codes only
- audit manipulation: existing server-side audit writes and sanitized metadata
- external side effects: M11 operation policy remains authoritative and `AMBIGUOUS` remains terminal

M12 adds no new network trust boundary. It does not broaden M11’s narrowly scoped Slack egress.

## M1–M11 compatibility review

The design preserves:

- Better Auth authentication and session handling
- centralized OWNER/ADMIN/MEMBER authorization
- workspace/brand-isolated RAG and knowledge
- provider-neutral `LLMProvider`
- controlled `AgentRunner` and static safe tools
- PostgreSQL workflow definitions, snapshots, runs, leases, and guarded transitions
- BullMQ and the transactional outbox
- PostgreSQL-authoritative scheduling
- secure M8 webhook encryption, replay, deduplication, and retention
- human-only M9 approval decisions
- M10 server-validated visual workflow editing
- M11 encrypted credentials, Slack `post_message`, policy-driven approval, and terminal ambiguity
- local Docker defaults, ports, named volumes, and Ollama behavior

The only concrete state-machine adaptation is adding explicit outbox deferral metadata because the current `workflow_run_dispatches` table has `PENDING`, `CLAIMED`, `DISPATCHED`, and `FAILED` but no `next_attempt_at` or defer reason. This is an additive, safe change and does not conflict with existing recovery.

## Explicit M13 exclusions

M13 excludes billing and paid plans, cloud deployment, infrastructure-as-code, external observability platforms, broad OAuth, new connectors, generic HTTP, unrestricted egress, browser automation, file uploads, plugins, marketplace features, multi-agent orchestration, arbitrary code/shell/SQL/filesystem access, collaborative editing, and public approval links.

## Acceptance criteria

The future implementation is accepted only when:

1. All M12 limits resolve through `WorkspaceUsagePolicy` and `SELF_HOSTED` is resolved server-side without a plan column.
2. Concurrent PostgreSQL admissions cannot exceed a durable quota.
3. Duplicate operation keys do not increment usage twice.
4. Redis restart cannot bypass daily PostgreSQL quotas.
5. Redis and PostgreSQL outage behavior is fail-closed for expensive/external operations.
6. Workflow concurrency defers outbox work without failing runs or creating retry storms.
7. Reservation renewal, release, expiry, crash recovery, and stale-worker guards are tested.
8. BullMQ, workflow, agent, webhook, stale-worker, and integration retries do not double-count.
9. Duplicate webhooks do not consume accepted-webhook durable quota.
10. `AMBIGUOUS` integration actions remain terminal and never automatically retry.
11. Correlation IDs propagate without sensitive data.
12. Logs, audit metadata, APIs, and UI remain redacted and bounded.
13. Liveness, core readiness, and degraded Ollama states are distinct.
14. Cleanup is bounded, idempotent, and preserves protected history.
15. Production configuration validation is strict only in production.
16. OWNER and ADMIN operations access is isolated; MEMBER access is denied.
17. Existing PostgreSQL data and Docker volumes remain intact.
18. The existing database and a clean temporary database both pass migration/schema checks.
19. `npm run typecheck`, `npm run lint`, `npm test -- --run`, `npm run build`, `docker compose config`, `docker compose up -d --build`, `docker compose ps`, and `./scripts/verify-local.ps1` pass.
