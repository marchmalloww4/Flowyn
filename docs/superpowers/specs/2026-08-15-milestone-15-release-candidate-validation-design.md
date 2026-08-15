# Milestone 15 — Release Candidate and Beta Validation Design

**Status:** Architecture approved; design and validation planning only
**Date:** 2026-08-15
**Baseline:** master at bf92f067d0d40961ebc9e310b19bc77235cdc0a6, also origin/master
**Release intent:** qualify the existing M1–M14 product as a controlled v1.0 release candidate and beta

## Objective

Milestone 15 validates the existing Flowyn product as a release candidate. It is a release, deployment,
recovery, security, performance, browser, accessibility, integration, and beta-evidence milestone. It
does not add a new product capability.

The release decision must be evidence-based. A passing local test suite alone is insufficient. The
release candidate must be reproducible from a known commit and immutable image digest, deployable
without data loss, recoverable after representative failures, isolated across workspaces, and usable
in supported browsers.

The release sequence is:

1. establish a frozen M14 baseline;
2. apply only narrow, evidence-backed release fixes;
3. build and scan a reproducible artifact;
4. rehearse migration, deployment, backup, restore, and failure recovery;
5. run bounded load, browser, accessibility, security, and Slack validation;
6. issue RC.1 only when all pre-RC gates pass;
7. run a time-bounded beta in a separate environment;
8. issue v1.0 only after beta exit and final release approval.

## Product and release philosophy

M15 is a qualification gate, not permission to broaden the trust model. Existing server-side
authorization, workspace isolation, controlled AI tools, bounded RAG, durable workflows, secure
webhooks, human approvals, and the single Slack post_message operation remain authoritative.

Every release claim requires an attached evidence record containing the commit, image digest,
environment class, command or procedure, timestamp, result, and operator. A missing or manually
asserted result is a failed gate, not an assumed pass.

## In scope

- release baseline and evidence index;
- reproducible dependency and container supply-chain evidence;
- immutable production artifact consumption;
- production Compose deployment rehearsal;
- migration, rollback, backup, restore, and recovery drills;
- controlled worker-only outbound Slack egress;
- Ollama model provisioning and readiness evidence;
- bounded non-AI performance characterization;
- hardware-specific Ollama performance characterization;
- Chromium, Firefox, and WebKit browser validation;
- accessibility and keyboard evidence;
- security, redaction, workspace-isolation, and authorization regression checks;
- controlled real Slack validation in a dedicated test environment;
- RC.1, beta, and final v1.0 release gates.

## Explicit non-goals

M15 does not add integrations, new workflow steps, new agent tools, generic HTTP, OAuth, uploads,
browser automation in the application runtime, billing, quotas, high availability, Kubernetes,
multi-region deployment, marketplace behavior, multi-agent orchestration, or a new AI provider.

It does not weaken readiness because an Ollama model is missing, retry an ambiguous external action,
expose secrets to AI or clients, or make local development depend on production artifact policy.

## Repository integration map

| Concern | Existing implementation | M15 validation or narrow fix |
| --- | --- | --- |
| Authentication | Better Auth and existing auth routes | Re-run authentication and session regression evidence |
| Authorization | Central workspace membership and role checks | Verify every release-facing path uses server authorization |
| Durable state | PostgreSQL with Drizzle and migrations 0000–0014 | Clean-database migration drill and current-database rehearsal |
| Async work | Redis and BullMQ workers | Retry, stale-worker, recovery, and backlog evidence |
| Durable dispatch | Transactional outbox | Crash and duplicate-dispatch evidence |
| Scheduler | PostgreSQL-authoritative scheduler | Scheduler restart and deferred dispatch evidence |
| AI | LLMProvider with Ollama implementation | Model provisioning, readiness, generation, embedding, and latency evidence |
| RAG | pgvector, BrandContext, workspace-scoped retrieval | Cross-workspace isolation and embedding-dimension evidence |
| Agents | AgentRunner and static safe tool registry | Confirm no integration tool or unrestricted capability is added |
| Workflows | Static step registry and durable workflow engine | Workflow state, retry, approval, webhook, and editor regressions |
| Webhooks | Narrow authenticated inbound webhook routes | Duplicate, signature, replay, and response-time evidence |
| Approvals | Durable human-only approval gates | Expiry, authorization, and non-automation evidence |
| Integrations | Encrypted credential vault and fixed Slack post_message | Dedicated test, egress, redaction, approval, and ambiguous-outcome evidence |
| Observability | Structured redacted logger and audit logging | Close concrete raw-error paths and prove redaction |
| Runtime | Development and production Docker Compose | Preserve local topology; rehearse immutable production topology |
| Verification | npm scripts, verify-local.ps1, Playwright, Vitest | Evidence matrix across local, clean, and production-like environments |

## Evidence model

The release evidence index must record at least:

| Gate | Required evidence |
| --- | --- |
| Source | exact commit SHA, branch, clean-tree output, and release change list |
| Artifact | image repository, immutable digest, build log, SBOM, provenance, and scan result |
| Dependencies | lockfile install, production dependency tree, audit result, and disposition of findings |
| Database | migration journal, clean-database run, current-database run, and schema verification |
| Backup | encrypted backup identifier, retention, checksum, and external key-custody reference |
| Restore | isolated restore transcript, row or invariant checks, and measured RTO |
| Recovery | injected failure, observed state, recovery action, and final invariant |
| Performance | profile, seed data, environment size, percentile results, and error rate |
| Browser | browser/version, viewport, test result, screenshot or trace reference when needed |
| Accessibility | axe result, keyboard path, focus evidence, and manual review |
| Slack | dedicated app/workspace/channel, operation, approval, durable action, audit result, and revocation |
| Beta | environment, participating workspaces, monitoring, incidents, feedback, and exit decision |
| Approval | named decision, date, unresolved P2/P3 disposition, and rollback readiness |

Evidence is immutable after a gate is approved except through a superseding record that names the
original and the reason for replacement.

## Immutable artifact and deployment design

Production must consume one shared Flowyn image for the migrator, app, worker, and scheduler. The
deployment input must be an explicit FLOWYN_IMAGE value, preferably a registry reference in the form
registry.example/flowyn@sha256:digest. The digest, not a human tag, is the authority.

The current production Compose file builds images locally. M15 may make the smallest release
qualification change necessary so production deployment consumes the pre-built digest while local
development Compose remains unchanged. The release-artifact workflow must produce the digest and
evidence that the production deployment consumes that same digest.

The deploy procedure must:

1. verify the requested digest and its SBOM, provenance, and scan evidence;
2. run the migrator against a PostgreSQL snapshot or approved maintenance window;
3. start app, worker, and scheduler from the same digest;
4. verify health, readiness, migration state, queue state, and logs;
5. retain the prior digest for forward rollback by redeploying the prior image.

There are no down-migrations. A failed release is recovered by restoring data when required and
redeploying a compatible prior image or forward-fixing the schema.

## Controlled outbound Slack egress

The current private production network is internal, while Slack execution occurs in the worker.
Therefore production egress must be made explicit before a real Slack validation. The smallest
acceptable design is a dedicated worker egress network or host/NAT path with a platform-level
allowlist for the required Slack API destination. PostgreSQL, Redis, Ollama, and the app remain
private. No generic HTTP client or user-provided destination is introduced.

The operation remains Slack post_message only. INTEGRATION_EGRESS_ENABLED remains false by default.
When enabled for a controlled test, the operation still requires the existing operation policy and
approval rules, uses an encrypted credential by ID, redacts credential material, and treats an
AMBIGUOUS outcome as terminal and non-retryable.

## Ollama provisioning and AI readiness

The production-like environment must provision and persist:

- llama3.2:3b for generation;
- nomic-embed-text for embeddings;
- the verified embedding dimension of 768 for the current model;
- the Ollama volume and model metadata required for restart recovery.

The dimension must be verified by an actual embedding response and matched to the configured
database/RAG schema. It must not be inferred solely from a model name. The evidence must show model
presence, generation readiness, embedding readiness, dimension, and behavior after container restart.

Missing AI models are a provisioning failure for an AI-required release and must not be hidden by
weakening readiness. The application may retain its existing degraded-AI behavior for operations
that do not require AI. Health and readiness evidence must distinguish liveness, core readiness,
and AI-required readiness.

## Database and migration design

M15 does not create a new feature migration. The release candidate must validate migrations 0000
through 0014 in order on a clean temporary PostgreSQL database and verify the current development
database without resetting it.

Migration execution remains PostgreSQL-authoritative and uses the existing advisory lock
7130413. The migrator must be run once per deployment. The journal, expected migration set, and
schema invariants must be checked before app traffic is admitted.

The existing db-preflight documentation claims checks for database version, capacity, and target
list, while scripts/db-preflight.ts currently checks connectivity, the migration journal,
workspaces, and the AI idempotency table. This is a concrete documentation/implementation gap.
M15 should either narrow the documentation to the current behavior or add only the minimum
test-backed checks needed for a safe release preflight.

## Backup, restore, and recovery

For the current single-host deployment, the initial release target is RPO 24 hours and RTO 2 hours,
using encrypted daily PostgreSQL backups retained outside the application host. A 15-minute RPO
requires separate WAL or point-in-time-recovery evidence and is not assumed.

Backup and restore evidence must cover:

- PostgreSQL data and migration state;
- workspace, workflow, approval, webhook, integration, audit, and usage data;
- encrypted credential ciphertext and external key custody;
- backup integrity and retention;
- Redis as recoverable ephemeral infrastructure rather than the durable source of truth;
- Ollama model reprovisioning rather than treating model files as the database backup;
- restore into an isolated temporary target;
- post-restore authorization, queue, outbox, scheduler, and health checks.

Recovery drills must include app, worker, scheduler, Redis, PostgreSQL, Ollama, outbox, webhook
duplicate, approval expiry, and Slack ambiguous-outcome scenarios. Durable state transitions must
remain idempotent, and no test may reset the existing development database or Docker volumes.

## Failure and retry semantics

The release candidate must preserve these invariants:

- BullMQ delivery retry does not double-count a durable domain operation;
- workflow retry does not duplicate a completed step;
- agent retry remains within the controlled runner and its operation policy;
- webhook duplicates converge on the existing idempotency record;
- stale-worker recovery resumes or marks work according to the existing state machine;
- integration retries are allowed only for retryable outcomes;
- AMBIGUOUS integration outcomes are terminal and never automatically retried;
- approvals remain human-only and cannot be completed by automation principals;
- outbox rows are dispatched at least once, with durable deduplication at the receiver/state boundary.

Every failure drill must name the durable state before failure, the observable state after restart,
the recovery action, and the expected final invariant.

## Performance validation

M15 uses two separate profiles because AI latency is hardware-dependent.

The initial bounded non-AI profile is 20 authenticated concurrent users and 5 requests per second
for 10 minutes against representative read, write, workflow acknowledgement, webhook, approval,
and operations paths. Initial acceptance targets are:

- read-path p95 at or below 750 ms and p99 at or below 1.5 s;
- workflow acknowledgement p95 at or below 1 s;
- webhook response p95 at or below 750 ms;
- error rate below 1 percent;
- queue backlog drain within 5 minutes after the profile;
- no database pool exhaustion, unbounded memory growth, or cross-workspace result.

The AI profile records model, hardware, prompt or document size, concurrency, generation latency,
embedding latency, timeout rate, and Ollama saturation. It is a characterization gate, not a
portable universal latency promise.

No load tool is added to the repository as part of this documentation change. A future approved
implementation may use an existing approved tool or a controlled external harness.

## Browser and accessibility validation

M15 expands validation to Chromium, Firefox, and WebKit. Critical smoke paths must run on all three
engines at 1280 px and 375 px. The exhaustive M14 suite remains on Chromium at 375, 768, and
1280 px, with representative accessibility checks on the other engines.

The browser matrix covers authentication, workspace switching, dashboard, workflow editor,
validation and save, execution visibility, approval interaction, webhook configuration, integration
configuration without secret disclosure, health/operations views, and error states.

Accessibility evidence includes axe checks with no serious or critical violations, keyboard-only
navigation, visible focus, logical heading and landmark structure, dialogs, validation messages,
responsive overflow, and reduced-motion behavior where relevant.

Playwright remains development/test tooling only. It does not become an application runtime
capability.

## Security and trust-boundary review

The release checklist must verify:

- Better Auth remains the authentication system;
- server-side workspace authorization is authoritative;
- client workspace state cannot grant access;
- PostgreSQL is the durable authority;
- Redis/BullMQ is asynchronous infrastructure only;
- transaction outbox and scheduler remain durable and PostgreSQL-authoritative;
- RAG and BrandContext are workspace/brand isolated;
- AgentRunner exposes only its static safe registry;
- workflows use the static step registry;
- automation principals remain internal and non-forgeable;
- Slack remains the fixed post_message operation;
- no generic HTTP, OAuth, uploads, shell, arbitrary SQL, filesystem, eval, dynamic modules, or
  runtime browser automation is added;
- credentials never appear in prompts, workflow snapshots, queue payloads, logs, audit metadata,
  outputs, or browser responses;
- raw operational errors are not exposed to users or unredacted logs.

Concrete raw-error paths to review include migration failure logging, workflow worker startup
logging, and AI generation-log persistence failure logging. The existing redacted logger and its
tests are the preferred abstraction. Any change must be narrow and regression-tested.

## Supply-chain strategy

The release evidence must include npm ci from the committed lockfile, Node 22.23.1 alignment
across engines, CI, and images, production dependency inspection, npm audit, image scanning,
SBOM, provenance, and digest verification.

The current production audit has zero critical, zero high, four moderate, and zero low findings.
The moderate finding chain is the esbuild advisory reached through the Drizzle tooling dependency
tree. M15 does not silently upgrade or force-fix dependencies. Each finding receives a dated
disposition, and release policy must state whether it blocks v1.0.

Mutable GitHub Action references and mutable container tags are supply-chain risks. M15 should
record them and, where implementation is explicitly approved, pin release-critical inputs by
reviewed commit or digest without unrelated dependency upgrades.

## Slack validation strategy

Real Slack validation is performed only in a dedicated test workspace, channel, and app with least
privilege. The test uses a synthetic message, the normal encrypted credential vault, the existing
approval path, and the existing durable integration action. Evidence must verify one durable action,
one audit record without secret material, correct redaction, and the expected Slack result.

After validation, revoke or rotate the test credential, disable egress, and retain only redacted
evidence. No Slack token, channel secret, or real customer data is committed or copied into logs.
A skipped real Slack test is an explicit release blocker for a release that claims Slack readiness.

## Beta strategy

Beta runs in a separate environment from development and production. The recommended initial cohort
is 3–10 workspaces and 5–20 users for 7–14 days. Beta entry requires RC.1, backup and restore
evidence, monitoring, an incident contact, known-workspace invitations, and a rollback rehearsal.

Beta exit requires no unresolved P0 or P1 defects, documented P2 disposition, successful backup
verification, stable health and queue metrics, feedback review, security review, and an explicit
release decision. Beta users must not be used as a substitute for load or security testing.

## Versioning and release states

The historical v0.13.0 tag remains unchanged. M15 may produce an RC or final tag only after explicit
release approval in a later authorized action. The candidate metadata and image digest must agree.
An RC.1 may be replaced by RC.2 only when a release-affecting defect or evidence change warrants it.

P0 blocks all use. P1 blocks RC or final release. P2 requires documented mitigation, owner, and
release decision. P3 may be deferred with a recorded rationale. Production release is not approved
merely because local checks pass.

## Acceptance criteria

M15 design and validation planning are complete when:

1. the two approved M15 documents exist and contain no implementation authorization;
2. the M1–M14 baseline and known concrete gaps are mapped to evidence tasks;
3. RC, beta, and final gates have objective evidence requirements;
4. deployment consumes a verified immutable digest;
5. migration, backup, restore, recovery, browser, accessibility, security, performance, Ollama,
   and Slack gates are explicit;
6. current moderate dependency findings and missing model provisioning are not hidden;
7. no M15 runtime change, migration, dependency change, tag, deploy, or commit is made by this
   planning action.

## Explicit M16 exclusions

M16 is outside this design and must not be started as part of M15: new product features, new
connectors, generic outbound HTTP, OAuth, uploads, browser automation, billing, quotas,
marketplace capabilities, high availability, Kubernetes, multi-region operation, multi-agent
orchestration, self-service enterprise administration, and changes to the approved AI or workflow
trust boundaries.

## Implementation boundary

This document authorizes creation of the M15 design and validation plan only. It does not authorize
source changes, infrastructure changes, migration generation, dependency installation or upgrades,
browser-engine installation, load-tool installation, real Slack activity, deployment, tagging,
commit, push, or M16 work.
