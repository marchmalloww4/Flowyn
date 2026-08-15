# Milestone 13 — Production Release Engineering, Security Remediation & Deployment Readiness

**Status:** Design specification only. No Milestone 13 implementation is included in this document change.

## Objective

Make the existing Flowyn M1–M12 system safe to deploy, upgrade, operate, monitor, recover, and roll back in a controlled production environment without expanding the product feature surface.

M13 is release engineering and reliability hardening. It must preserve the existing workspace, AI, RAG, agent, workflow, webhook, approval, integration, quota, and audit boundaries.

## Repository baseline

- Branch: master.
- Baseline: 1259b67 feat: add production hardening and operational controls.
- HEAD matches origin/master.
- The working tree is clean.
- M1–M12 implementation commits, M12 design/plan documents, and migration 0013_minor_quasimodo.sql are present.
- No M13 implementation, migration, CI workflow, production Docker image, backup script, or deployment descriptor currently exists.
- The local runtime was previously verified with app, worker, scheduler, PostgreSQL, Redis, and Ollama running. The liveness and readiness endpoints returned healthy responses during the readiness audit.
- The current application image is development-oriented: docker/app.Dockerfile runs npm run dev, and docker-compose.yml sets NODE_ENV=development.
- The installed dependency tree is clean under npm ls, but a read-only production audit reported seven vulnerabilities: four moderate and three high, including findings in the Next.js dependency tree. No dependency change is part of this design phase.

## Audit findings being remediated

| ID | Finding | M13 response |
| --- | --- | --- |
| F-01 | Development Docker runtime, public internal service ports, mutable images, and placeholder configuration are unsuitable for production. | Add a production image and a private-network production Compose reference while preserving the local Compose path. |
| F-02 | Production validation checks only a few placeholders and is not enforced by every runtime process. | Add role-aware startup validation for app, worker, scheduler, and migrator. |
| F-03 | Direct AI Idempotency-Key deduplicates durable usage admission but does not suppress duplicate provider calls or replay results. | Add a workspace-scoped durable request record, encrypted bounded sync-result replay, and an explicit non-replayable streaming contract. |
| F-04 | The dependency tree contains unresolved high/moderate audit findings. | Add a controlled vulnerability policy and a separately reviewable upgrade task with regression gates. |
| F-05 | Backup, restore, PITR, and disaster-recovery behavior are not documented or tested. | Add release gates, operational runbooks, and an actual isolated restore drill. |
| F-06 | Worker and scheduler liveness is not part of a fleet-level operational model. | Use per-instance Redis heartbeats, process health checks, graceful drain, and explicit deployment monitoring semantics. |
| F-07 | There are no CI/CD release gates or production artifact checks. | Add GitHub validation workflows without automatic production deployment. |
| F-08 | Metrics and operational alerting interfaces are absent. | Add vendor-neutral low-cardinality metric interfaces and the minimum production metric contract. |
| F-09 | Architecture, AI, setup, security, and README material contains stale milestone/runtime references. | Update the five named documents and add production operations runbooks. |

## Scope and non-goals

### In scope

- Production-grade app, worker, scheduler, PostgreSQL, Redis, and Ollama runtime topology.
- Multi-stage Docker build and a separate production Compose reference.
- Strict production configuration validation and startup enforcement.
- Private service networking, TLS/reverse-proxy assumptions, and exposed-port policy.
- GitHub CI and controlled release artifact validation.
- Dependency vulnerability policy and controlled upgrade process.
- Safe migration execution, migration locking, backup gates, and forward-fix rollback policy.
- PostgreSQL backup/PITR and an isolated restore drill.
- Redis, BullMQ, PostgreSQL, credential-vault, encryption-key, and Ollama recovery semantics.
- Durable direct-AI idempotency for non-streaming requests.
- Explicit non-replayable streaming idempotency semantics.
- Crash-window, lease, outbox, scheduler, approval, and integration recovery tests.
- Worker/scheduler health, graceful drain, heartbeat monitoring, metrics, logging, and operational runbooks.
- Corrections to README, SETUP, ARCHITECTURE, SECURITY, and AI documentation.

### Explicit non-goals

- New third-party connectors.
- Generic HTTP or user-provided outbound targets.
- OAuth or credential brokerage.
- Billing, paid plans, quotas beyond the existing M12 policy, marketplace, or plugins.
- Browser automation or file uploads.
- Multi-agent orchestration, agent memory, or critic systems.
- Major workflow semantics or general DAG/loop execution.
- Major dashboard redesign.
- Hosted AI provider implementation.
- Arbitrary code, shell, SQL, filesystem, dynamic executable modules, or unrestricted network access.
- Automatic production deployment.
- Kubernetes or infrastructure-as-code as a required runtime.
- M14 implementation.

## Architectural principles

1. PostgreSQL remains the authoritative source for durable application state, migrations, workflow runs, usage admission, concurrency reservations, AI idempotency records, and recovery decisions.
2. Redis remains asynchronous infrastructure and short-window rate-limit/heartbeat storage. Redis loss must not erase durable usage, workflow, approval, integration, or AI idempotency state.
3. Better Auth remains the only authentication system.
4. Centralized workspace authorization remains authoritative for every new AI idempotency read/write and every operational route.
5. LLMProvider, EmbeddingProvider, AgentRunner, the static workflow registry, the existing outbox, and the existing Slack action state machine are reused.
6. M13 adds no generic egress path. slack.chat.postMessage remains the only connector operation, and INTEGRATION_EGRESS_ENABLED=false remains the default.
7. Existing at-least-once workflow semantics remain explicit. M13 does not claim exactly-once side effects.
8. A production process must fail closed on invalid configuration and must never silently adopt local-development defaults.
9. Every new durable record is bounded, workspace-scoped, redacted from operational projections, and covered by retention and recovery tests.

## Production topology

The initial production reference is Docker Compose on one controlled host or a private staging host. It is intentionally not a general cloud architecture and does not require Kubernetes.

    flowchart LR
      Browser[Browser] --> Edge[HTTPS reverse proxy or load balancer]
      Edge --> App[Flowyn app]
      App --> Auth[Better Auth]
      App --> DB[(Private PostgreSQL + pgvector)]
      App --> Redis[(Private Redis)]
      App --> Ollama[(Private Ollama)]
      Worker[Workflow worker] --> DB
      Worker --> Redis
      Worker --> Ollama
      Migrator[One-shot migrator] --> DB
      Worker --> Slack[Fixed Slack chat.postMessage]

Topology rules:

- Only the edge proxy is externally reachable.
- The app listens on an internal container port. If the edge runs on the host, the app port is bound to loopback or a private interface only.
- PostgreSQL, Redis, and Ollama have no public host ports in the production Compose file.
- The browser never connects directly to PostgreSQL, Redis, or Ollama.
- The app, worker, scheduler, migrator, and dependencies share a private Compose network.
- The fixed Slack target is reachable only from the server-side integration egress path. It is disabled by default.
- TLS terminates at the edge proxy for browser traffic. Managed/external PostgreSQL and Redis connections require TLS. A bundled database on a private single-host network is permitted only as a documented controlled-host exception and must not be exposed outside that private network.
- The reverse proxy must forward the original HTTPS origin and request correlation headers without allowing arbitrary trusted origins.

### Is production Compose sufficient?

Yes, as the smallest initial deployment reference for a controlled single host or private staging environment. It is not a claim that Compose provides high availability, managed backups, multi-zone failover, or fleet orchestration. Those concerns remain deployment-specific and are documented as operational prerequisites. Kubernetes is not necessary to satisfy M13 and is explicitly excluded.

## Runtime and process model

### Shared image with separated processes

App, worker, and scheduler use one versioned Flowyn application image built once from the same commit, but they run as separate containers and separate commands:

- App: Next.js production server using standalone output.
- Worker: existing worker/workflow-worker.ts entrypoint through the production runtime.
- Scheduler: existing worker/workflow-scheduler.ts entrypoint through the production runtime.
- Migrator: existing migration runner as a one-shot command or Compose profile; it is never an always-on service.

Sharing one image prevents source/configuration drift while process separation preserves independent restart, health, scaling, and drain behavior. The currently locked tsx package may be moved from development-only dependencies into the production runtime dependency set at the same version because worker and scheduler currently execute TypeScript entrypoints. This is a classification change, not an upgrade. If implementation instead compiles these entrypoints to JavaScript, the compiled output must retain the existing path aliases and must be tested in the production image.

### Multi-stage image

The production Dockerfile will:

1. Use a pinned Node 20 base image compatible with the repository engine floor.
2. Install from package-lock.json with npm ci.
3. Run typecheck and the production Next build in a builder stage.
4. Enable Next standalone output while retaining the worker/scheduler runtime files.
5. Copy only the production runtime artifacts and required source/entrypoint files into the final image.
6. Run as a non-root user.
7. Expose only the app’s internal port.
8. Use an immutable image tag based on the commit SHA; release tags are additional human-readable aliases.

The existing development Dockerfile and docker-compose.yml remain the local-development path.

### Graceful shutdown

- App receives SIGTERM through the container runtime and stops accepting new requests according to the Next.js process behavior.
- Worker stops dispatch polling, stops accepting new BullMQ work, waits for active jobs to drain within the configured shutdown timeout, and preserves active workflow leases for stale recovery if the timeout expires.
- Scheduler stops polling, finishes the active batch, stops maintenance, and removes only its own heartbeat.
- Migrator exits success or failure and is never restarted as a long-running process.
- Database and Redis connections are closed explicitly by worker, scheduler, and migrator shutdown paths.
- Shutdown timeouts are bounded and validated; a forced exit is observable and leaves durable state for recovery.

## Production configuration model

### Startup enforcement locations

Introduce a server-only role-aware startup function, for example assertRuntimeConfiguration({ role: "app" | "worker" | "scheduler" | "migrator" }).

It is called:

- App: from Next.js instrumentation.ts during server startup before accepting application traffic.
- Worker: at the beginning of worker/workflow-worker.ts before creating BullMQ connections.
- Scheduler: at the beginning of worker/workflow-scheduler.ts before creating Redis connections.
- Migrator: before opening the migration connection.

Readiness remains a diagnostic endpoint. It must not be the only configuration enforcement mechanism. A process with invalid production configuration must fail startup rather than remain live but unusable.

### Required production validation

Production validation must reject:

- Known development placeholders for Better Auth, webhook encryption, integration keyring, and AI-idempotency response encryption.
- NEXT_PUBLIC_APP_URL that is not an HTTPS origin without a path, query, or wildcard.
- WEBHOOK_PUBLIC_BASE_URL that is not an HTTPS origin.
- Trusted origins that are not exact HTTPS origins or that contain wildcards, credentials, paths, or uncontrolled subdomains.
- Localhost, loopback, default usernames/passwords, or insecure default database/Redis credentials in external production configuration.
- PostgreSQL URLs that explicitly disable TLS when the deployment is not the documented private-network exception.
- Redis URLs that use insecure external transport when TLS is required.
- Missing, malformed, or non-32-byte encryption key material.
- An integration keyring whose current version is absent or whose values are not valid 32-byte keys.
- Unsafe integration configuration, including an invalid egress flag or an endpoint/operation configuration outside the static Slack registry.
- Invalid pool sizes, timeout values, worker concurrency, shutdown timeouts, idempotency retention, or response-size limits.
- Missing Ollama configuration or a non-approved remote Ollama endpoint. User input can never select an endpoint.

Local development behavior remains unchanged: .env.example, localhost URLs, development keys, local Docker DNS, and INTEGRATION_EGRESS_ENABLED=false remain valid only outside production.

### Trusted origins

Add a server configuration value such as BETTER_AUTH_TRUSTED_ORIGINS, parsed as a bounded comma-separated list. In production it must contain the application origin, use exact HTTPS origins, and reject wildcard or HTTP entries. Better Auth receives this validated list. The edge proxy and app use the same configured origin policy.

### Pooling and connection security

Add bounded configuration for PostgreSQL pool size, connect timeout, idle timeout, and shutdown timeout. The total allowed pool capacity must be documented as the sum of app, worker, scheduler, and migrator connections, not only the per-process value. External PostgreSQL and Redis URLs use TLS settings required by the deployment. The application does not expose database or Redis credentials through health or error responses.

## Database release safety

### Migration rules

- Existing migrations 0000 through 0013 remain immutable.
- M13’s AI idempotency schema is generated through npm run db:generate; the generated SQL and Drizzle metadata are reviewed and committed together.
- No database reset, db:push, destructive migration, or manual metadata edit is allowed.
- Production migration runs as a one-shot migrator before app/worker rollout.
- The migrator acquires a PostgreSQL advisory lock so only one migrator can run at a time.
- A preflight checks connectivity, current migration state, database version, available space, and the target migration list.
- A migration failure stops the release and leaves the previous application version running where compatibility permits.
- Rollback is a forward-fix strategy. The application image can be rolled back only when the schema remains backward-compatible; no automatic down migration is used.
- Risky migrations require a successful backup checkpoint before execution and an explicit operator approval in the deployment process.

### M13 schema addition

M13 is expected to add one generated table for direct-AI idempotency, without changing the existing M12 quota/admission tables:

ai_generation_idempotency

- id UUID primary key.
- workspace_id foreign key to workspaces with cascade deletion.
- operation_key bounded text.
- request_fingerprint fixed-length hash text.
- mode check constraint: SYNC or STREAM.
- status check constraint: IN_PROGRESS, SUCCEEDED, FAILED, UNKNOWN, or STREAM_COMPLETED.
- response_ciphertext nullable and bounded by application validation.
- response_model nullable bounded text.
- response_duration_ms nullable bounded integer.
- error_code nullable allowlisted application error code.
- error_status nullable bounded HTTP status.
- correlation_id nullable bounded safe identifier.
- created_at, updated_at, completed_at, and expires_at timestamps.

Indexes:

- Unique (workspace_id, operation_key) for workspace-scoped idempotency.
- (workspace_id, expires_at) for bounded cleanup.
- (workspace_id, status, updated_at) for stale in-progress recovery.

The table stores no prompt, request body, response metadata beyond the bounded replay payload, credential, provider payload, RAG context, workflow output, or raw error. The replay payload is encrypted with a purpose-specific application keyring and is returned only after the same authenticated workspace and exact request fingerprint have been established.

## Direct AI idempotency design

### Request fingerprint

The server canonicalizes the validated request and trusted effective configuration before provider execution. The fingerprint includes:

- Workspace ID.
- Generation mode (SYNC or STREAM).
- Prompt and optional system input length/content through a SHA-256 digest, never as stored plaintext.
- Brand and RAG selection.
- Temperature and max-token values after server validation.
- Trusted provider and model configuration.

The stored fingerprint is a digest only. It is compared in constant-time-safe application logic after the workspace and operation key have been resolved.

### State machine

    IN_PROGRESS -- provider success + durable result --> SUCCEEDED
         |                                                |
         | known normalized provider/application failure   | duplicate same key
         v                                                v
       FAILED <--------------------------------------- replay result
         |
         | process crash / stale lease / unknown provider outcome
         v
       UNKNOWN -------------------------------------- duplicate conflict

    STREAM mode:
    IN_PROGRESS --> STREAM_COMPLETED (no replay payload)
    IN_PROGRESS --> FAILED
    IN_PROGRESS --> UNKNOWN

### Same key behavior

- Same workspace, same key, same fingerprint, SUCCEEDED: decrypt and replay the bounded non-stream result; do not call LLMProvider; do not create another usage admission.
- Same workspace, same key, same fingerprint, FAILED: replay only the stored normalized error; do not call LLMProvider.
- Same workspace, same key, same fingerprint, IN_PROGRESS: return a bounded conflict such as AI_IDEMPOTENCY_IN_PROGRESS; do not call LLMProvider a second time.
- Same workspace, same key, UNKNOWN: return a non-retryable idempotency conflict; the client must choose a new key. The server never guesses whether the provider completed.
- Same workspace, same key, different fingerprint: return HTTP 409 IDEMPOTENCY_KEY_REUSED.
- Different workspace, same key: resolve only the caller’s workspace record. There is no cross-workspace lookup or replay.

### Transaction and quota interaction

The first request creates the idempotency record and performs the existing PostgreSQL durable AI admission in one transaction. If quota admission fails, the transaction rolls back and no provider call occurs. A duplicate that finds an existing record never invokes durable admission again. The operation key used for workspace_usage_admissions is derived from the workspace-scoped AI idempotency identity.

The initial request commits IN_PROGRESS before calling LLMProvider. This is intentional: the record prevents duplicate provider execution across requests. If the process crashes before the provider call or before completion is durable, stale recovery changes the record to UNKNOWN; it does not automatically call the provider again.

### Non-streaming replay

- Persist only a bounded result, with a hard maximum of 64,000 characters after provider normalization.
- Encrypt the result using a purpose-specific AES-256-GCM keyring separate from webhook and integration key material.
- Store no prompt or raw provider payload.
- Replay only the safe result shape already returned by the route.
- Never include the result in logs, audit metadata, operations projections, workflow snapshots, or queue payloads.
- Retain idempotency rows for seven days by default, with a bounded production override. The key-reuse window is documented as seven days; after cleanup, the key is a new logical operation.

### Streaming contract

Streaming output is not durably replayed. A streaming request with an idempotency key still creates a durable single-execution record:

- Duplicate while active: 409 AI_IDEMPOTENCY_IN_PROGRESS.
- Duplicate after STREAM_COMPLETED: 409 AI_STREAM_NOT_REPLAYABLE; no provider call.
- Known provider failure: replay the normalized failure; no provider call.
- Crash or connection loss before terminal state: mark UNKNOWN; the same key cannot retry automatically.
- A client that wants a new attempt must use a new key and accept a new quota admission.

This keeps streaming semantics explicit rather than pretending an SSE stream can be safely reconstructed from a sync response cache.

### Key rotation and backup

The AI-idempotency response keyring is purpose-specific, versioned, and backed up separately from the database. Restoring the database without the matching keyring makes stored replay payloads unreadable; the restore procedure must verify this relationship. Key rotation decrypts with the historical version and re-encrypts with the configured current version in a bounded maintenance task. Key material never enters logs, queues, prompts, snapshots, or browser responses.

## Failure and recovery semantics

| Failure | Durable result | Automatic retry |
| --- | --- | --- |
| Provider returns a known normalized AI error | FAILED idempotency record and safe generation log | No same-key provider retry; a new key may retry according to policy |
| Process crashes before AI result commit | IN_PROGRESS becomes UNKNOWN after bounded stale recovery | No automatic provider retry |
| Redis outage during workflow outbox dispatch | PostgreSQL outbox remains PENDING/CLAIMED; lease recovery reclaims it | Existing bounded dispatch retry after Redis returns |
| Worker crashes during a workflow AI step | Workflow lease expires and stale execution is recovered; AI idempotency prevents direct-request duplication, while workflow step semantics remain at-least-once | Only existing workflow retry policy; no exactly-once claim |
| Stale workflow lease | Execution token prevents stale completion; current worker resumes | Existing guarded recovery |
| Stale concurrency reservation | Reservation expires and is reaped; PostgreSQL state remains authoritative | New guarded acquisition |
| Scheduler interruption | PostgreSQL schedule occurrence uniqueness prevents duplicate occurrence | Next scheduler poll handles due work |
| Approval continuation interruption | Waiting/decision state remains durable; generation-aware outbox resumes | Existing outbox recovery |
| Slack action outcome unknown | Action becomes terminal AMBIGUOUS | Never automatically retried |
| PostgreSQL outage | Requests requiring durable state fail closed | No in-memory quota or state fallback |
| Ollama/model outage | App readiness is degraded; AI-dependent operations fail safely | No uncontrolled provider loop |

M13 does not change M11 AMBIGUOUS behavior and does not convert at-least-once workflow execution into exactly-once execution.

## Worker and scheduler operability

- Worker and scheduler retain process-specific health commands.
- Replace the single shared heartbeat value with per-instance keys under bounded prefixes, for example flowyn:worker:heartbeat:<instanceId> and flowyn:scheduler:heartbeat:<instanceId>, while updating the existing health scripts and tests.
- Heartbeat values contain only a bounded instance ID; TTL is short and validated.
- A container health check validates its own heartbeat. An operator probe can scan the bounded prefix to report fleet members without treating Redis as durable business state.
- The app readiness endpoint remains responsible for app traffic readiness: configuration, PostgreSQL, Redis, migrations, and Ollama as currently defined. Ollama failure remains degraded rather than changing M12 semantics.
- Worker and scheduler health are separate deployment gates. An app may remain ready while a worker is being replaced, but production rollout is not considered complete until the required worker and scheduler instances report healthy heartbeats.
- Worker SIGTERM stops new dispatch, drains active jobs within the shutdown timeout, and leaves guarded leases for recovery if forced to exit.
- Scheduler SIGTERM stops polling and waits for the active poll/maintenance cycle.
- Deployment replacement uses a stop-old/start-new or start-new/stop-old sequence with explicit heartbeat and queue-drain checks; both sequences must be tested.

## Backup, restore, and disaster recovery

### PostgreSQL

The production baseline recommends:

- Encrypted daily full backups.
- Continuous WAL archiving/PITR where the hosting platform supports it.
- Seven daily and four weekly restore points as a starting retention policy.
- Target RPO of 15 minutes or better with WAL; target RTO of two hours for a single-host recovery.
- A pre-migration backup checkpoint for migrations classified as risky.
- Backup encryption independent of application secrets.

The exact storage provider is deployment-specific; M13 defines the procedure and verification contract rather than selecting a vendor.

### Restore drill

The restore drill runs against an isolated temporary PostgreSQL instance:

1. Create a backup from the current database.
2. Restore it into the isolated instance.
3. Supply the matching webhook, integration, and AI-idempotency keyrings through a separate secure test environment.
4. Run immutable migrations and schema checks.
5. Verify workspace, workflow, approval, integration-action, usage, and idempotency counts.
6. Verify encrypted webhook/credential/idempotency decryption without printing plaintext.
7. Verify readiness and safe outbox recovery.
8. Record elapsed restore time and the result.

No backup-readiness claim is accepted until this drill passes.

### Credential vault and encryption keys

Database backups contain encrypted webhook and integration material, not plaintext secrets. The corresponding keyrings must be backed up separately with version history, access control, and dual-control recovery. Losing a keyring while retaining the database is an intentional unrecoverable-key condition and must produce an explicit incident response rather than silent data corruption.

### Redis and BullMQ

PostgreSQL is authoritative for workflow runs, outbox dispatch, approvals, usage, reservations, schedules, and integration action state. Redis persistence may be enabled for operational continuity, but Redis loss is not treated as loss of durable application state. Recovery performs a bounded outbox sweep after Redis returns. Short-window rate limits and heartbeat keys may reset. BullMQ jobs are reconstructed from pending/stale PostgreSQL outbox rows; the system does not rely on an unrecoverable Redis-only job payload.

### Ollama

Ollama model files are runtime artifacts, not authoritative application state. The production procedure either backs up the model volume or re-pulls the exact approved model versions from an approved source. Readiness remains degraded until the configured model and embedding model are available and the embedding dimension matches the database contract.

## CI/CD architecture

GitHub Actions provides validation and artifact checks only. Production deployment remains controlled/manual.

### Pull request and push gates

The CI workflow runs:

1. npm ci.
2. npm run typecheck.
3. npm run lint.
4. npm test -- --run.
5. Clean PostgreSQL migration verification.
6. Existing-schema migration verification against a disposable database seeded from the current migration chain.
7. npm run build.
8. Production image build.
9. Compose production configuration validation.
10. Secret scanning and container/image scanning.

The workflow uploads logs, migration reports, test results, and the immutable image digest as artifacts. It does not deploy production.

### Release artifact

A manually triggered release workflow may build and publish a content-addressed image after CI has passed. It must not run database migrations or deploy by default. Promotion requires an operator to select the image digest, run the migration/backup procedure, and perform smoke and readiness checks.

### Dependency security policy

- Critical vulnerabilities: zero accepted in release artifacts.
- High vulnerabilities: zero by default; any temporary exception requires a written owner, reason, affected package, compensating control, expiry date, and follow-up issue.
- Moderate vulnerabilities: reviewed and either fixed or accepted with the same time-bound record when reachable in production.
- npm audit fix and npm audit fix --force are prohibited in the release process.
- package-lock.json is authoritative; CI uses npm ci and fails on lockfile drift.
- Base images are pinned by version and digest and rescanned on release.
- Dependency upgrades are separate reviewable tasks with typecheck, lint, full tests, clean/current migration checks, build, image scan, and runtime smoke tests.

The currently reported Next.js findings are not waived silently. They remain a release blocker until reviewed and either remediated through a controlled upgrade or covered by a time-bound accepted-risk record that satisfies the policy.

## Observability model

Use existing correlation IDs, logInfo/logError, redaction, readiness, operations projections, and audit events. Add a vendor-neutral metric interface with low-cardinality dimensions and a no-op or structured development sink.

Required metric families:

- HTTP request count, status class, and latency bucket.
- Readiness status and dependency failure counts.
- Workflow outbox pending, claimed, failed, deferred, and dispatch latency.
- Workflow run started, completed, failed, cancelled, and duration.
- Worker jobs active, completed, failed, stale-recovered, and drain duration.
- Scheduler poll duration, lag, claimed, triggered, skipped, and failed occurrences.
- Usage admission accepted, duplicate, rejected, and database-failure counts.
- Concurrency reservation acquired, denied, expired, released, and saturation.
- AI provider latency, success/failure, idempotency replay, idempotency conflict, and unknown outcome.
- Integration success, retryable failure, terminal failure, and AMBIGUOUS outcomes.

Metric labels must not contain prompts, responses, credential IDs when not required, raw URLs, user IDs, workspace IDs at high cardinality, provider payloads, or secrets. Correlation IDs remain available in structured logs and selected durable operational rows but are not used as an unbounded metric label.

The initial implementation does not commit Flowyn to Prometheus, OpenTelemetry, Sentry, Datadog, or another commercial vendor. The metric interface can later be adapted by deployment code.

## Security invariants

M13 must preserve all of the following:

- Better Auth remains the authentication boundary.
- Central workspace authorization remains authoritative.
- Workspace IDs are never trusted from a client without membership/resource checks.
- Webhook encryption remains compatible with M8 envelopes and key versions.
- Integration credentials remain encrypted and workspace-scoped.
- INTEGRATION_EGRESS_ENABLED=false remains the default.
- slack.chat.postMessage remains the only outbound connector operation.
- No generic HTTP, arbitrary URLs, methods, headers, or redirects are introduced.
- No integration tools are exposed to AgentRunner.
- Human approval gates remain human-only.
- AMBIGUOUS integration outcomes remain terminal and non-retryable.
- No shell, arbitrary SQL, filesystem, browser automation, dynamic modules, or arbitrary code execution is added.
- No plaintext secrets appear in logs, queues, prompts, audit metadata, workflow snapshots, operations projections, or API responses.
- AI idempotency response ciphertext is not exposed outside the exact authorized replay path.
- No M13 route exposes raw idempotency records or provider payloads.

## API and UI implications

M13 does not add a new product surface. The existing AI route gains deterministic idempotency behavior:

- Idempotency-Key remains optional for non-streaming requests.
- Same-key successful non-streaming requests replay the safe result.
- Same-key streaming requests return a documented non-replayable conflict after completion.
- Same-key fingerprint mismatch returns 409.
- Unknown provider/process outcomes return a safe conflict requiring a new key.

No new browser route is required for idempotency. The existing UI should display a concise retry instruction for safe idempotency conflicts and never display internal status details, ciphertext, prompts, or provider payloads.

Operational health remains machine-facing. Worker/scheduler fleet status is not exposed to ordinary workspace members through a new dashboard in M13; deployment/operator checks use protected runtime probes and existing operations foundations.

## Migration strategy

1. Implement and test the schema change locally.
2. Run npm run db:generate against the updated Drizzle schema.
3. Review the generated SQL and snapshot; do not hand-edit generated metadata.
4. Apply the generated migration to a clean temporary database.
5. Apply it to a copy of the current schema/data without reset.
6. Verify readiness and idempotency state behavior.
7. Add a production preflight and backup gate.
8. Execute through the one-shot migrator before deploying code that requires the new table.

The app must remain backward-compatible with the previous schema until the migration is complete. If the migration cannot be applied, the previous release remains the active version and no partial application rollout proceeds.

## Testing strategy

Test-first implementation must include:

- Configuration rejection for every unsafe production condition and every runtime role.
- Startup validation invocation for app, worker, scheduler, and migrator.
- Production image startup and non-root checks.
- Private-port Compose assertions.
- Clean and existing database migration checks.
- AI same-key/same-fingerprint replay.
- AI same-key/different-fingerprint rejection.
- AI provider failure replay.
- AI process-crash and stale-record recovery.
- Streaming duplicate and non-replayable behavior.
- Quota admission exactly once for duplicate keys.
- Cross-workspace key isolation.
- Redis outage during outbox dispatch.
- Worker crash and stale workflow lease recovery.
- Reservation expiration and recovery.
- Scheduler interruption and occurrence uniqueness.
- Approval continuation interruption.
- Terminal integration ambiguity and no retry.
- Per-instance heartbeat, stale-instance detection, and graceful drain.
- Metric redaction and bounded labels.
- Backup creation and actual isolated restore drill.
- Secret scanning, dependency policy, image scanning, and lockfile reproducibility.
- All existing M1–M12 regression checks.

Required final verification includes:

    npm ci
    npm run typecheck
    npm run lint
    npm test -- --run
    npm run build
    docker compose config
    docker compose -f docker-compose.production.yml config
    docker compose -f docker-compose.production.yml build
    docker compose -f docker-compose.production.yml up -d
    docker compose -f docker-compose.production.yml ps
    .\scripts\verify-local.ps1
    git diff --check

Production verification additionally requires clean/current migration tests, startup rejection tests, private networking assertions, AI idempotency tests, crash/recovery tests, dependency/security gates, backup creation, and the restore drill. No command may reset the existing development database or Docker volumes.

## Operational runbooks

M13 produces or updates these documents:

- docs/operations/deployment.md
- docs/operations/rollback.md
- docs/operations/migrations.md
- docs/operations/backup-restore.md
- docs/operations/secret-rotation.md
- docs/operations/incident-response.md
- docs/operations/worker-scheduler.md
- docs/operations/dependency-vulnerability-response.md

Each runbook states prerequisites, commands, expected results, failure stop conditions, secret-handling rules, and recovery verification.

## Documentation consistency

M13 updates:

- README.md: M13 runtime posture, production-vs-local distinction, verification, and deferred capabilities.
- SETUP.md: local setup remains intact; production setup and no-volume-reset rules are linked separately.
- ARCHITECTURE.md: replace stale milestone boundary, add M11/M12/M13 runtime and operations modules, and document the production topology.
- SECURITY.md: document production configuration, private networking, TLS/origin requirements, idempotency response protection, and the unchanged egress/security boundaries.
- AI.md: document direct-AI idempotency, streaming semantics, crash behavior, bounded encrypted replay, and the unchanged provider/RAG boundary.

## M14 boundary

M14 begins only after M13 acceptance. M14 may address a separately approved product or provider capability, but it must not be smuggled into release engineering. In particular, M14 is not included in the production image, CI workflows, migration plan, backup drill, or UI changes described here.

## Acceptance criteria

M13 is accepted only when all of the following are true:

1. A versioned production image runs app, worker, scheduler, and migrator as separate processes with NODE_ENV=production.
2. Invalid production configuration fails startup for every runtime role.
3. Only the app/edge path is externally reachable; PostgreSQL, Redis, and Ollama are private.
4. Existing local Docker behavior and volumes remain intact.
5. CI validates dependencies, typecheck, lint, tests, migrations, build, image, secrets, and scan policy without automatic deployment.
6. Dependency vulnerabilities are remediated or have an explicit time-bound accepted-risk record.
7. Existing migrations are immutable and the generated M13 migration passes clean/current database verification.
8. Backup creation, isolated restore, keyring compatibility, readiness, and outbox recovery are demonstrated.
9. Direct non-streaming AI duplicate keys replay safely without a second provider call; streaming duplicates never trigger uncontrolled replay.
10. Provider/process crash windows become explicit safe terminal or recoverable states without false exactly-once claims.
11. Worker and scheduler drain, heartbeat, replacement, and stale-instance behavior are verified.
12. Required production metrics and redacted logs are emitted with bounded labels.
13. All operational runbooks and stale documentation references are corrected.
14. M1–M12 tests and security invariants remain green.
15. No M14 capability or new unrestricted trust boundary is included.

**Design status:** Ready for implementation approval.
