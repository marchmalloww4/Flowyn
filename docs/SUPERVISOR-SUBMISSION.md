# Flowyn — Supervisor Submission

## 1. Project Overview

Flowyn is a local-first business automation platform for teams that need to
combine workspace knowledge, AI assistance, controlled agents, durable
workflows, approvals, and a narrowly scoped external action. It provides a
workspace-oriented dashboard where a user can manage brand context, create and
run automations, inspect operational state, and demonstrate how an approved
workflow can reach a fixed Slack `post_message` operation.

Flowyn is presented for academic and project evaluation as **Flowyn
v1.0.0-rc.1**. The implementation is complete and the technical release-candidate
qualification is complete. A separate controlled beta and external production
deployment have not been performed, so this document does not claim a final
production release.

## 2. Problem Statement

Teams often keep brand guidance, operational decisions, AI prompts, and external
actions in disconnected tools. That fragmentation makes it difficult to reuse
trusted business context, understand why an automation acted, enforce who may
approve an action, and recover safely after a service or worker failure.

Flowyn addresses this problem by making workspace ownership, brand context,
authorization, durable workflow state, human approval, and auditability explicit
parts of one system. The platform deliberately keeps the external action
surface narrow so that the demonstration is useful without turning the product
into an unrestricted HTTP or code-execution system.

## 3. Project Objectives

### Primary objectives

- Provide a usable workspace-based automation dashboard.
- Support brand-aware knowledge and AI generation through local Ollama models.
- Provide controlled agents and durable workflows that can survive retries and
  worker restarts.
- Require human authorization before externally affecting integration actions.
- Demonstrate a secure, workspace-isolated Slack `post_message` path.
- Make operational state, health, limits, and recovery behavior observable.

### Technical objectives

- Keep PostgreSQL authoritative for durable application state.
- Keep authentication and workspace authorization server-side.
- Keep AI calls behind `LLMProvider` and keep RAG bounded and isolated.
- Use static registries for agent tools, workflow steps, and integration
  operations.
- Use the transactional outbox, BullMQ, leases, idempotency keys, and guarded
  recovery to avoid duplicate durable actions.
- Keep credentials encrypted and absent from prompts, queues, logs, audit
  metadata, snapshots, outputs, and browser responses.
- Validate the same application across type checking, linting, automated tests,
  Docker, browser, accessibility, migration, recovery, and release gates.

## 4. Scope

### Included

The repository includes the completed M1–M15 implementation: authentication,
workspaces and roles, brands and knowledge, local AI/RAG, controlled agents,
durable workflows, scheduling, secure inbound webhooks, human approvals, a
server-validated visual workflow editor, a fixed Slack integration, usage and
operational controls, responsive and accessible UI, and release-candidate
validation infrastructure.

### Explicitly excluded

The product does not provide generic outbound HTTP, arbitrary destinations,
OAuth, uploads, browser automation inside the application, shell execution,
arbitrary SQL, dynamic code execution, billing, marketplace behavior, high
availability, Kubernetes, multi-region deployment, or multi-agent
orchestration. Slack is intentionally the only outbound connector operation.

Future expansion of these boundaries would require a separately reviewed
security and product decision; it is not an additional project milestone here.

## 5. System Architecture

```text
Browser / UI
    |
    v
Next.js App Router and protected API routes
    |
    +--> PostgreSQL + pgvector  (durable application and RAG state)
    +--> Redis / BullMQ         (bounded asynchronous infrastructure)
    +--> Ollama                 (local generation and embeddings)
    |
    +--> transactional outbox --> Worker --> fixed Slack post_message egress
    |
    +--> Scheduler --> PostgreSQL-authoritative due state --> Worker
```

The browser uses the Next.js dashboard and API routes. Route handlers authenticate,
validate input, authorize workspace access, and delegate business logic to
services in `lib/`. PostgreSQL stores durable state and migration history.
Redis supports BullMQ, bounded rate limits, heartbeats, and transient
coordination; it is not the source of truth for workflow, schedule, quota, or
approval state. Ollama provides the local language and embedding models.

The worker is the only production process attached to the explicit egress
network. PostgreSQL, Redis, Ollama, the migrator, scheduler, and application
remain on the private service network in the production reference Compose
topology. The external target remains fixed to Slack's `chat.postMessage` API.

### Project structure

```text
app/                 Next.js pages and route handlers
components/          UI primitives, dashboard panels, and workflow editor
lib/                 Domain services, authorization, AI, workflow, security,
                     integration, health, usage, and observability logic
db/migrations/       Generated Drizzle PostgreSQL migrations
scripts/             Verification, backup, restore, and health helpers
tests/               Vitest contracts/integration tests and Playwright tests
docs/                Architecture, operations, release, and submission docs
docker/              Application and Ollama runtime images
worker/              Durable workflow worker and scheduler entry points
```

## 6. Technology Stack

Versions below are taken from the repository package metadata and Compose
configuration rather than inferred from the project name.

| Technology | Repository version or configuration | Role |
| --- | --- | --- |
| TypeScript | `^5.8.3` | Static typing and strict application code |
| Next.js | `16.3.1` | App Router, pages, and API routes |
| React | `^19.1.0` | Dashboard and interactive components |
| Node.js | `>=22.23.1` | Required runtime floor |
| Tailwind CSS | `^4.1.8` | Utility-first styling |
| UI primitives | shadcn/ui-compatible local primitives | Accessible reusable UI building blocks |
| PostgreSQL | `pgvector/pgvector:pg16` in Compose | Durable relational and vector state |
| pgvector | Included by the PostgreSQL image | Semantic knowledge retrieval |
| Redis | `redis:7-alpine` in Compose | Queue, bounded rate limits, and heartbeats |
| BullMQ | `^6.1.1` | Durable job delivery infrastructure |
| Ollama | `ollama/ollama:latest` in Compose | Local model runtime |
| Drizzle ORM | `^0.45.2` | Schema, queries, and generated migrations |
| Better Auth | `^1.3.7` | Authentication and sessions |
| Docker | Compose v2 prerequisite | Local and production-reference runtime |
| Vitest | `^3.2.4` | Unit and integration verification |
| Playwright | `@playwright/test` `1.61.1` | Browser validation |
| axe | `@axe-core/playwright` `4.12.1` | Accessibility checks |
| GitHub Actions | Repository CI/security workflows | Automated quality and supply-chain checks |

## 7. Major Features

- **Authentication:** Better Auth email/password sign-in, sign-up, and sessions.
- **Workspace management:** workspace creation, switching, membership, and
  role-aware management.
- **Authorization:** server-side `OWNER`, `ADMIN`, and `MEMBER` policy checks
  for every workspace-owned operation.
- **Brands:** workspace-owned brand profiles, voice data, rules, examples, and
  bounded context selection.
- **Knowledge/RAG:** manual brand-scoped documents, deterministic chunking,
  verified embeddings, pgvector storage, semantic retrieval, and bounded
  `BrandContext`.
- **AI generation:** provider-neutral `LLMProvider` with Ollama generation,
  structured validation, streaming support, idempotency, and safe generation
  logging.
- **AgentRunner:** controlled synchronous agents with bounded steps, timeouts,
  safe tools, trusted runtime context, cancellation, and safe run history.
- **Workflows:** immutable versioned definitions, static step registry, graph
  validation, durable runs, leases, cancellation, retries, and recovery.
- **Visual workflow editor:** server-validated React Flow canvas and Advanced
  JSON view with version-aware conflict handling and separate layout state.
- **Scheduling:** CRON, interval, and one-time schedules with PostgreSQL-owned
  occurrences and a dedicated scheduler process.
- **Inbound webhooks:** HMAC/timestamp verification, replay protection, bounded
  bodies, rate limits, PostgreSQL deduplication, and safe event history.
- **Human approvals:** durable approval inbox and role-based approval decisions
  that cannot be made by agents, webhooks, or automation principals.
- **Encrypted credentials:** workspace-scoped credential vault with versioned
  AES-256-GCM envelopes and safe metadata-only projections.
- **Slack action:** the single fixed `slack.chat.post_message` connector
  operation, protected by policy, approval, worker-only egress, idempotency,
  and terminal `AMBIGUOUS` handling.
- **Usage and limits:** server-resolved `SELF_HOSTED` policy, PostgreSQL quota
  admission, Redis short-window rate limits, concurrency reservations, and
  workspace usage/operations projections.
- **Observability:** correlation IDs, structured redacted logs, audit records,
  metrics contracts, health checks, readiness, and worker/scheduler heartbeats.
- **Operations:** migration preflight, advisory-lock migration execution,
  backup/restore tooling, retention cleanup, recovery runbooks, and immutable
  production-image guidance.
- **Product experience:** responsive dashboard shell, onboarding guidance,
  loading/error/empty states, keyboard-visible focus, and accessible management
  surfaces.
- **Release engineering:** pinned runtime/development dependencies, production
  Compose reference, release validation, browser matrix evidence, and security
  gates.

## 8. AI Architecture

All domain AI calls use the `LLMProvider` abstraction. The current implementation
uses Ollama with:

- `llama3.2:3b` for generation;
- `nomic-embed-text` for embeddings; and
- a verified live embedding dimension of **768**, matched to the pgvector
  database contract.

Knowledge documents belong to a workspace-owned brand. Indexing chunks the
document deterministically, obtains embeddings from the configured provider,
validates the returned dimension, and replaces the document's chunks
transactionally. Retrieval is bounded by configured character and result
limits. `BrandContext` marks retrieved text as untrusted context and does not
grant it authority over system instructions or tools.

The AI generation service validates request size, workspace/brand relationships,
structured output, and idempotency. Generation logs contain safe bounded
metadata. AgentRunner receives trusted workspace context and a static allowlist
containing safe brand/knowledge tools; it does not receive integration tools,
shell access, arbitrary HTTP, filesystem access, or dynamic code execution.

AI-required operations depend on model provisioning. If Ollama is unavailable,
core readiness can remain available in the documented degraded-AI state, while
AI-required operations fail safely. This behavior does not convert missing model
provisioning into a production qualification pass.

## 9. Workflow Architecture

Workflow definitions are validated against a static registry and saved as
immutable versions. The supported step types are `SET_VALUE`, `TRANSFORM`,
`CONDITION`, `AI_GENERATE`, `AGENT`, `APPROVAL`, and `INTEGRATION_ACTION`.
Executable runs reference a versioned snapshot so later edits cannot change an
in-flight execution.

Creation and continuation use PostgreSQL transaction boundaries and the
transactional outbox. An outbox dispatcher delivers jobs to BullMQ at least
once. PostgreSQL remains authoritative for run, step, lease, approval, schedule,
webhook, and integration-action state. The worker uses leases and stale-worker
recovery to prevent a crashed worker from permanently blocking work.

Workflow retries are bounded and distinguish retryable provider/infrastructure
failures from terminal validation, authorization, rejection, expiration, and
ambiguous external outcomes. A worker releases its lease while waiting for a
human approval and resumes the same immutable snapshot only after a currently
authorized `OWNER` or `ADMIN` decision. Schedules and inbound webhooks create
the same durable run/outbox path; they do not create a second execution engine.

The integration action may reach Slack only after server-side policy validation
proves approval coverage and workspace credential ownership. Credential IDs may
be referenced in workflow configuration, but plaintext credentials never enter
snapshots, queues, prompts, logs, audit metadata, outputs, or API responses.

## 10. Security Architecture

- **Authentication:** Better Auth remains authoritative for sessions.
- **Authorization:** central workspace membership checks enforce `OWNER`,
  `ADMIN`, and `MEMBER` permissions on the server; client workspace state never
  grants access.
- **Tenant isolation:** every workspace-owned read and write is scoped through
  the authenticated user's membership and the requested workspace.
- **Credential protection:** integration credentials are encrypted with
  AES-256-GCM envelopes, versioned through a keyring, and returned only through
  safe metadata projections. Key material is configured outside committed source.
- **Webhook protection:** inbound workflow webhooks use timestamped HMAC-SHA256,
  replay windows, body-size bounds, rate limits, and PostgreSQL deduplication.
- **Approval protection:** integration actions require an immutable approval
  path; only a human user with the required current workspace role may decide.
- **Outbound boundary:** Slack `post_message` is the only connector operation;
  `INTEGRATION_EGRESS_ENABLED` defaults to `false`; production egress is
  restricted to the worker path and the fixed Slack destination.
- **Failure safety:** `AMBIGUOUS` external outcomes are terminal and are never
  automatically retried.
- **Redaction:** structured logging, audit metadata, queue payloads, workflow
  snapshots, AI prompts, workflow outputs, and browser/API responses exclude
  credential material and provider secrets.
- **Denied capabilities:** no generic HTTP, arbitrary URL, shell, arbitrary SQL,
  filesystem execution, `eval`, dynamic executable modules, or runtime browser
  automation is available to the application or AgentRunner.

These controls are product boundaries, not defects to be bypassed for a normal
demonstration.

## 11. Database Architecture

PostgreSQL is the durable authority and Drizzle owns the generated migration
chain. The current repository contains migrations `0000` through `0014`, with
`0014_last_magus.sql` as the latest migration and matching Drizzle metadata.
Migrations are applied by the migrator/preflight path and protected by a
PostgreSQL advisory lock; down-migrations and destructive volume resets are not
part of normal release operation.

The persistent domains are:

- Better Auth users, sessions, accounts, and verification records;
- workspaces, memberships, roles, usage buckets/admissions, and concurrency
  reservations;
- brands, voice profiles, rules, examples, knowledge documents, and vector
  chunks;
- audit logs, AI generation logs, and AI idempotency records;
- agent definitions, runs, and bounded run steps;
- workflow definitions, immutable versions, editor layouts, runs, step runs,
  outbox dispatches, leases, and cancellations;
- approvals, schedules, occurrences, webhook triggers/events, and delivery
  deduplication;
- encrypted integration credential metadata/lifecycle and durable integration
  action runs.

Workspace IDs and membership checks are part of the authorization boundary, not
just UI filters. Vector retrieval, AI context, workflows, approvals, schedules,
webhooks, credentials, usage, operations, and audit projections remain scoped to
the owning workspace.

## 12. Production Architecture

`docker-compose.production.yml` defines a production reference topology using a
shared immutable Flowyn image for the migrator, app, worker, and scheduler. The
services are:

- **migrator:** one-shot migration/preflight process with advisory locking;
- **app:** Next.js server and authenticated API, attached to private and ingress
  networks;
- **worker:** durable workflow consumer with the only external egress network;
- **scheduler:** PostgreSQL-authoritative schedule poller with Redis heartbeat;
- **PostgreSQL:** private pgvector database;
- **Redis:** private BullMQ/heartbeat/rate-limit service; and
- **Ollama:** private local model service with persisted model volume.

The production reference uses read-only application containers, temporary
filesystem space, readiness checks, startup configuration validation, private
database/Redis/Ollama networking, and explicit worker egress configuration. The
repository also contains local Docker Compose with named development volumes.
These are deployment instructions and a reference architecture, not evidence
that Flowyn has been deployed to an external production environment.

Backups and restore drills are documented separately. PostgreSQL is backed up as
durable application state; Redis is recoverable ephemeral infrastructure; Ollama
models are reprovisioned or restored separately. Rollback is an image/process
operation rather than a database reset.

## 13. Testing and Validation

The final M15 qualification evidence for the repository reports the following:

| Area | Evidence |
| --- | --- |
| TypeScript | `npm run typecheck` passed |
| Lint | `npm run lint` passed |
| Unit/integration | 176 Vitest files; 518 passing tests |
| Production build | `npm run build` passed |
| Local runtime | Docker/Compose and `verify-local.ps1` passed |
| Database | Current-database and clean-database migration/preflight validation passed |
| Recovery | Advisory-lock, backup/restore, worker, scheduler, Redis, and outbox recovery checks passed |
| Browser | Chromium, Firefox, and WebKit each passed 21/21 release checks |
| Accessibility | axe qualification passed with no serious/critical findings; keyboard smoke passed |
| Responsive UI | 375px, 768px, and 1280px checks passed |
| AI/RAG | Ollama generation/embedding checks passed; live embedding dimension was 768 |
| Slack | Dedicated full-path qualification passed exactly one real `post_message` delivery through vault, approval, outbox, worker, and durable action state |
| Security | Workspace isolation, authorization, redaction, fixed-connector, approval, and terminal-ambiguity checks passed |
| Dependency audit | 0 critical and 0 high production findings; 4 moderate findings remain documented |

The evidence distinguishes automated local/production-like qualification from
operational claims. It does not claim that a 7–14 day beta cohort, an external
production deployment, or final `v1.0.0` approval occurred.

## 14. Release Status

### Current candidate

`v1.0.0-rc.1`

### Qualified application commit

`273346d` — the application commit named by the RC tag.

The later documentation commit `ee8f8dd` adds the controlled-beta evidence
template and supervisor package preparation. It does not change the qualified
application code. At the time this package is prepared, the local branch may be
a documentation commit ahead of the remote branch; verify the final Git status
and remote tag before submission.

### Gate status

- **Implementation:** COMPLETE.
- **Technical RC qualification:** PASS.
- **Full-path dedicated Slack qualification:** PASS.
- **Controlled beta:** NOT YET PERFORMED.
- **External production deployment:** NOT VERIFIED.
- **Final `v1.0.0`:** NOT TAGGED and not approved.

## 15. Known Limitations

- The separate controlled beta environment, cohort, observation period, and
  feedback evidence remain pending.
- An external production deployment and its operator evidence remain pending.
- Four moderate production dependency findings remain documented and require
  an explicit release disposition; there are zero critical or high findings in
  the reported production audit.
- AI latency and throughput depend on the host hardware allocated to Ollama.
- Slack is intentionally the only outbound connector; Flowyn is not a generic
  third-party connector platform.
- Production model provisioning must be performed and evidenced in the target
  environment before AI-required production operations are considered ready.

These limitations preserve the stated release truth. They do not weaken the
security boundaries or invalidate the project implementation for supervisor
evaluation.

## 16. Future Work

The following are possible extensions outside the completed project and are not
named as another milestone:

- additional individually reviewed connectors with separate threat models;
- managed production infrastructure and operational ownership;
- larger-scale performance characterization on dedicated hardware;
- richer operational analytics and reporting; and
- additional reviewed AI model/provider implementations behind `LLMProvider`.

Any future extension would need to preserve server-side authorization,
workspace isolation, bounded AI/RAG behavior, durable state, approval semantics,
credential protection, and the deny-by-default execution boundaries.

## 17. Conclusion

Flowyn delivers a coherent workspace automation system that joins local AI,
brand knowledge, controlled agents, durable workflows, scheduling, secure
webhooks, human approvals, visual editing, and a deliberately narrow Slack
action. Its architecture makes state ownership, authorization, recoverability,
and security boundaries visible instead of hiding them inside an unbounded
automation runtime.

The implementation and technical RC qualification are complete, making
`v1.0.0-rc.1` suitable for supervisor demonstration and academic evaluation.
The document remains explicit that controlled beta evidence, external
production deployment, and final `v1.0.0` release approval are separate
operational gates that have not yet been completed.
