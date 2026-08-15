# Milestone 13 Production Release Engineering Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make the existing Flowyn M1–M12 system deployable and operable in a controlled production environment without expanding the product feature surface.

**Architecture:** Preserve the modular monolith, Better Auth, PostgreSQL/Drizzle, Redis/BullMQ, Ollama through LLMProvider, static AgentRunner/workflow registries, secure webhooks, human approvals, and fixed Slack egress. Add a production-only image/topology, startup-enforced configuration, durable direct-AI idempotency, release gates, recovery drills, and vendor-neutral operational instrumentation.

**Tech Stack:** Next.js 15, TypeScript, Drizzle/PostgreSQL/pgvector, Redis/ioredis, BullMQ, Ollama, Docker Compose, GitHub Actions, Vitest, PowerShell operational scripts, and the existing security/redaction abstractions.

**Spec:** docs/superpowers/specs/2026-08-15-milestone-13-production-release-engineering-design.md

## Global Constraints

- Preserve all M1–M12 behavior and existing Docker volumes.
- Do not reset databases or volumes.
- Existing migrations 0000 through 0013 are immutable.
- Generate any new Drizzle migration with npm run db:generate; review generated SQL and metadata.
- Do not run npm audit fix or npm audit fix --force.
- Do not upgrade dependencies as part of unrelated work. Any required upgrade is a separate task with compatibility gates.
- Better Auth remains the authentication system.
- Central workspace authorization remains authoritative.
- PostgreSQL remains durable application state; Redis remains asynchronous infrastructure and bounded short-window state.
- LLMProvider, EmbeddingProvider, AgentRunner, the static workflow registry, transactional outbox, scheduler, approval gates, webhook ingress, and Slack action state machine remain the only existing execution boundaries.
- INTEGRATION_EGRESS_ENABLED=false remains the default.
- slack.chat.postMessage remains the only outbound connector operation.
- AMBIGUOUS integration outcomes remain terminal and never automatically retried.
- No generic HTTP, arbitrary URLs/methods/headers, shell, arbitrary SQL, filesystem access, browser automation, dynamic executable modules, or unrestricted network access.
- No M14 implementation.

---

## File map before implementation

### Create

- instrumentation.ts — app-process startup validation hook.
- lib/runtime/startup.ts — role-aware production startup validation and shutdown policy.
- lib/ai/idempotency.ts — durable direct-AI idempotency state machine and fingerprinting.
- lib/observability/metrics.ts — vendor-neutral metric interface and bounded labels.
- docker/production.Dockerfile — multi-stage production image.
- docker-compose.production.yml — private-network production reference.
- db/migrations/0014_<generated-name>.sql — generated AI-idempotency migration.
- db/migrations/meta/0014_snapshot.json — generated Drizzle metadata.
- tests/runtime-startup.test.ts
- tests/production-compose.test.ts
- tests/ai-idempotency.test.ts
- tests/ai-idempotency-recovery.test.ts
- tests/ai-idempotency.integration.test.ts
- tests/worker-operability.test.ts
- tests/metrics-contract.test.ts
- tests/migration-preflight.test.ts
- tests/backup-restore-contract.test.ts
- scripts/db-preflight.ts
- scripts/backup-postgres.ps1
- scripts/restore-drill.ps1
- docs/operations/deployment.md
- docs/operations/rollback.md
- docs/operations/migrations.md
- docs/operations/backup-restore.md
- docs/operations/secret-rotation.md
- docs/operations/incident-response.md
- docs/operations/worker-scheduler.md
- docs/operations/dependency-vulnerability-response.md
- .github/workflows/ci.yml
- .github/workflows/security.yml
- .github/workflows/release-artifact.yml

### Modify

- lib/env.ts — strict production validation, trusted origins, pool/timeouts, idempotency/keyring settings.
- lib/auth/auth.ts — use validated trusted-origin configuration.
- lib/security/secrets.ts — purpose-specific encrypted AI replay envelope, reusing AES-GCM conventions without reusing integration keys.
- lib/database/schema.ts — AI idempotency table and indexes.
- lib/database/client.ts — bounded pool configuration and explicit shutdown compatibility.
- lib/database/migrate.ts — advisory lock and migration preflight integration.
- lib/queue/connection.ts — bounded Redis/TLS/retry configuration.
- lib/health/readiness.ts — preserve app readiness semantics and expose background-runtime diagnostic contracts where appropriate.
- lib/workflows/worker.ts — per-instance heartbeat, drain, and shutdown behavior.
- lib/schedules/scheduler.ts — per-instance heartbeat, drain, and shutdown behavior.
- scripts/check-worker-health.ts
- scripts/check-scheduler-health.ts
- worker/workflow-worker.ts
- worker/workflow-scheduler.ts
- app/api/ai/generate/route.ts — durable idempotency admission/replay contract.
- lib/ai/service.ts — separate idempotent sync and non-replayable stream paths.
- lib/http.ts — request metrics and safe error metrics.
- lib/usage/admission.ts — metric hooks only; preserve PostgreSQL authority.
- lib/workflows/outbox.ts — dispatch/recovery metrics and only necessary recovery fixes.
- lib/integrations/actions.ts — terminal ambiguity metrics only; preserve state transitions.
- next.config.ts — standalone output while retaining existing typed routes.
- package.json and package-lock.json — only necessary script/runtime classification changes or separately approved dependency upgrades.
- .dockerignore — exclude secrets, local artifacts, and development caches from production image context.
- README.md, SETUP.md, ARCHITECTURE.md, SECURITY.md, AI.md — consistency and production guidance.
- scripts/verify-local.ps1 — retain local behavior and add M13-safe checks without volume reset.

The exact changed-file set must be compared with this map before implementation commit. No application behavior is changed during the current design/plan phase.

---

## Task 1: Establish production configuration failure tests

**Files:**

- Create: tests/runtime-startup.test.ts
- Modify: tests/production-config.test.ts
- Modify: lib/env.ts
- Create: lib/runtime/startup.ts

**Interfaces:**

- Consumes: existing getEnv(), getProductionConfigurationIssues(), parseSecretKeyring(), and M12 policy bounds.
- Produces: assertRuntimeConfiguration({ role }), getRuntimeConfigurationIssues({ role }), and validated trusted-origin/pool/shutdown/idempotency configuration for app, worker, scheduler, and migrator.

- [ ] Step 1: Write failing configuration tests

Cover exact rejection cases:

    it("rejects HTTP application origins in production", () => {
      expect(getRuntimeConfigurationIssues({ ...validProductionEnv(), NEXT_PUBLIC_APP_URL: "http://flowyn.example" }, "app")).toContain("NEXT_PUBLIC_APP_URL");
    });

    it("rejects a wildcard or non-HTTPS trusted origin", () => {
      expect(getRuntimeConfigurationIssues({ ...validProductionEnv(), BETTER_AUTH_TRUSTED_ORIGINS: "https://*.example" }, "app")).toContain("BETTER_AUTH_TRUSTED_ORIGINS");
    });

    it("rejects the local database and Redis defaults in production", () => {
      const env = validProductionEnv({ DATABASE_URL: "postgres://flowyn:flowyn@localhost:5432/flowyn", REDIS_URL: "redis://localhost:6379" });
      expect(getRuntimeConfigurationIssues(env, "worker")).toEqual(expect.arrayContaining(["DATABASE_URL", "REDIS_URL"]));
    });

    it("rejects the development encryption keyring for every runtime role", () => {
      expect(() => assertRuntimeConfiguration({ role: "scheduler", env: validProductionEnvWithDevelopmentKeys() })).toThrow();
    });

Also test pool bounds, shutdown bounds, egress flag validation, current key versions, Ollama endpoint policy, and role-specific required values.

- [ ] Step 2: Run the focused tests and verify failure

Run:

    npm test -- --run tests/runtime-startup.test.ts tests/production-config.test.ts

Expected: FAIL because the new role-aware validator and production rules do not yet exist.

- [ ] Step 3: Implement the smallest startup validation layer

Keep getEnv() responsible for shape parsing and make lib/runtime/startup.ts responsible for production-only safety policy. Use exact origin parsing, bounded lists, placeholder detection, URL/transport checks, keyring validation, and role-specific requirements. Do not log invalid values or secrets.

- [ ] Step 4: Run focused tests and static checks

    npm test -- --run tests/runtime-startup.test.ts tests/production-config.test.ts
    npm run typecheck
    npm run lint

Expected: PASS with no secret material in assertion output.

- [ ] Step 5: Commit the isolated configuration change during implementation

    git add lib/env.ts lib/runtime/startup.ts tests/runtime-startup.test.ts tests/production-config.test.ts
    git commit -m "feat: enforce production runtime configuration"

**Migration implications:** None.

**Security/regression considerations:** Preserve all local defaults outside production. Do not turn INTEGRATION_EGRESS_ENABLED on implicitly. Do not make readiness the only enforcement path.

## Task 2: Wire startup validation into every runtime role

**Files:**

- Create: instrumentation.ts
- Modify: worker/workflow-worker.ts
- Modify: worker/workflow-scheduler.ts
- Modify: lib/database/migrate.ts
- Modify: tests/runtime-startup.test.ts

**Interfaces:**

- Consumes: assertRuntimeConfiguration() from Task 1.
- Produces: startup rejection before app, worker, scheduler, or migrator connections are opened.

- [ ] Step 1: Add invocation-level failing tests

Mock each runtime initializer and assert configuration validation runs before database, Redis, BullMQ, scheduler, or migration initialization. Add a production invalid-config test for each role.

- [ ] Step 2: Run the focused tests and verify failure

    npm test -- --run tests/runtime-startup.test.ts

Expected: FAIL because runtime entrypoints currently start without the new role hook.

- [ ] Step 3: Wire startup hooks

Call app validation from Next instrumentation and call the worker, scheduler, and migrator validators before their first connection. Keep error output to safe error names/codes and exit non-zero.

- [ ] Step 4: Verify startup ordering

    npm test -- --run tests/runtime-startup.test.ts
    npm run typecheck
    npm run lint

Expected: PASS; invalid production configuration prevents runtime initialization.

**Migration implications:** None.

**Security/regression considerations:** Next instrumentation must not run browser code. Development and test startup must remain usable without production-only secrets.

## Task 3: Harden database/Redis connection and shutdown contracts

**Files:**

- Create: tests/connection-runtime.test.ts
- Modify: lib/database/client.ts
- Modify: lib/queue/connection.ts
- Modify: lib/env.ts
- Modify: worker/workflow-worker.ts
- Modify: worker/workflow-scheduler.ts

**Interfaces:**

- Consumes: role-aware env validation.
- Produces: bounded PostgreSQL pool/connect/idle settings, Redis TLS/retry settings, and explicit worker/scheduler connection closure.

- [ ] Step 1: Write failing connection tests

Test that pool size and timeout values are bounded, external TLS URLs are honored, Redis worker connections retain maxRetriesPerRequest: null, scheduler probes retain bounded retries, and shutdown closes database/queue resources.

- [ ] Step 2: Run focused tests

    npm test -- --run tests/connection-runtime.test.ts

Expected: FAIL for missing configurable limits and shutdown wiring.

- [ ] Step 3: Implement bounded connection configuration

Reuse getEnv() and existing closeDatabase()/closeQueueConnection() primitives. Do not add a second database or queue abstraction. Preserve the worker’s BullMQ retry requirements and scheduler’s short health-check retry policy.

- [ ] Step 4: Verify

    npm test -- --run tests/connection-runtime.test.ts
    npm run typecheck
    npm run lint

**Migration implications:** None.

**Security/regression considerations:** Do not log DSNs or Redis URLs. Ensure TLS configuration cannot be selected from request data.

## Task 4: Add production image and private Compose reference

**Files:**

- Create: docker/production.Dockerfile
- Create: docker-compose.production.yml
- Create: .dockerignore
- Modify: next.config.ts
- Modify: package.json and package-lock.json only if the locked tsx runtime classification is required
- Create: tests/production-compose.test.ts

**Interfaces:**

- Consumes: startup hooks, worker/scheduler commands, existing health checks, and migration runner.
- Produces: one immutable production image with app/worker/scheduler/migrator roles and a private-network Compose topology.

- [ ] Step 1: Write production Compose contract tests

Assert with YAML parsing or docker compose config output that:

    app, worker, scheduler, migrator, postgres, redis, ollama exist;
    app/worker/scheduler use NODE_ENV=production;
    postgres, redis, and ollama have no host ports;
    migrator is one-shot and does not restart;
    worker and scheduler have health checks;
    INTEGRATION_EGRESS_ENABLED defaults to false;
    the app is the only externally reachable service;

- [ ] Step 2: Run the contract test before implementation

    npm test -- --run tests/production-compose.test.ts
    docker compose -f docker-compose.production.yml config

Expected: FAIL or file-not-found before the production files exist; no services are started.

- [ ] Step 3: Implement the multi-stage image

Build with npm ci, run the production build, use Next standalone output, copy the worker/scheduler runtime, use a non-root user, and pin the Node base image by version/digest. Keep docker/app.Dockerfile unchanged for local development.

- [ ] Step 4: Implement private production Compose

Use an internal network, no database/Redis/Ollama host ports, a one-shot migrator profile, health checks, bounded restart policies, explicit resource expectations, and environment injection without development fallbacks. Do not add a generic proxy or generic HTTP service to Flowyn.

- [ ] Step 5: Build and verify the artifact

    docker compose -f docker-compose.production.yml config
    docker compose -f docker-compose.production.yml build
    docker compose -f docker-compose.production.yml up -d
    docker compose -f docker-compose.production.yml ps

Expected: app, worker, scheduler, PostgreSQL, Redis, and Ollama become healthy; dependency services have no public host bindings; app health is reachable only through the configured edge/loopback path.

**Migration implications:** The production Compose migrator must run the existing migration chain; it must not reset or push schema.

**Security/regression considerations:** Scan the build context for .env, secrets, .next caches, logs, and node_modules. Verify the local Compose path remains unchanged.

## Task 5: Add generated AI idempotency schema

**Files:**

- Create: tests/ai-idempotency-schema.test.ts
- Modify: lib/database/schema.ts
- Create: db/migrations/0014_<generated-name>.sql
- Create: db/migrations/meta/0014_snapshot.json
- Modify: db/migrations/meta/_journal.json

**Interfaces:**

- Consumes: existing workspace foreign-key and index conventions.
- Produces: typed aiGenerationIdempotency table with workspace-scoped uniqueness and bounded status/fingerprint/retention fields.

- [ ] Step 1: Write schema contract tests

Assert the table name, required columns, status/mode checks, workspace foreign key, unique workspaceId/operationKey index, cleanup index, and stale-state index.

- [ ] Step 2: Run the schema test and inspect the current migration chain

    npm test -- --run tests/ai-idempotency-schema.test.ts
    Get-ChildItem db/migrations | Sort-Object Name

Expected: FAIL because the table is not yet present; migrations 0000–0013 remain untouched.

- [ ] Step 3: Add only the Drizzle schema definition

Use the existing schema types, foreign-key style, text checks, timestamps, and index naming conventions. Do not place response plaintext in audit or operations tables.

- [ ] Step 4: Generate the migration

    npm run db:generate

Expected: one new generated migration and matching metadata. Do not hand-edit the generated SQL or metadata.

- [ ] Step 5: Review and test the generated migration

    Get-Content db/migrations/0014_*.sql
    npm test -- --run tests/ai-idempotency-schema.test.ts tests/migration-schema-contract.test.ts
    npm run typecheck

Expected: only the new AI idempotency schema is added; no prior migration changes occur.

**Migration implications:** This is the only planned M13 application-schema migration. Apply it to clean and existing temporary databases before production rollout.

**Security/regression considerations:** Preserve M8/M11 ciphertext and key-version columns. Never store prompts, credentials, raw provider payloads, or queue bodies in the new table.

## Task 6: Add purpose-specific encrypted replay primitives

**Files:**

- Create: tests/ai-idempotency-secrets.test.ts
- Modify: lib/security/secrets.ts
- Modify: lib/security/keyring.ts only if a generic context type is needed
- Modify: lib/env.ts

**Interfaces:**

- Consumes: existing AES-256-GCM envelope conventions and keyring parser.
- Produces: encryptAiIdempotencyResponse() and decryptAiIdempotencyResponse() with purpose/version/workspace/record associated data.

- [ ] Step 1: Write failing crypto tests

Test round-trip encryption, wrong workspace/record rejection, wrong key-version rejection, malformed-envelope rejection, 64,000-character bound, and key rotation compatibility. Assert plaintext never appears in the envelope.

- [ ] Step 2: Run focused tests

    npm test -- --run tests/ai-idempotency-secrets.test.ts

Expected: FAIL until the new purpose-specific envelope exists.

- [ ] Step 3: Implement the envelope by reusing AES-GCM conventions

Use a separate AI-idempotency keyring, not the integration or webhook key. Bind ciphertext to workspace ID, record ID, status/version, and key version. Keep errors generic and never log plaintext.

- [ ] Step 4: Verify security properties

    npm test -- --run tests/ai-idempotency-secrets.test.ts tests/integration-secrets.test.ts tests/webhook-secrets.test.ts
    npm run typecheck

Expected: new and existing encryption tests pass; M8 and M11 envelopes remain compatible.

**Migration implications:** None beyond the schema fields from Task 5.

**Security/regression considerations:** Purpose separation is mandatory. Do not reuse the integration credential keyring for AI responses.

## Task 7: Implement durable non-streaming AI idempotency

**Files:**

- Create: tests/ai-idempotency.test.ts
- Create: tests/ai-idempotency-recovery.test.ts
- Create: tests/ai-idempotency.integration.test.ts
- Create: lib/ai/idempotency.ts
- Modify: lib/ai/service.ts
- Modify: app/api/ai/generate/route.ts
- Modify: lib/security/errors.ts
- Modify: lib/usage/admission.ts only to accept the existing transaction context cleanly

**Interfaces:**

- Consumes: authenticated workspace input, LLMProvider, admitAiGeneration, recordGenerationLog, correlation IDs, and the generated table.
- Produces: beginDirectAiGeneration(), completeDirectAiGeneration(), failDirectAiGeneration(), recoverStaleDirectAiGeneration(), and safe replay/error results.

- [ ] Step 1: Write failing service tests

Cover:

    same key + same fingerprint + success => stored result, provider called once;
    same key + different fingerprint => 409, provider not called;
    same key while IN_PROGRESS => 409, provider not called;
    same key + FAILED => same normalized error, provider not called;
    stale IN_PROGRESS => UNKNOWN, no automatic provider retry;
    duplicate key => one PostgreSQL usage admission;
    different workspaces => no record lookup or replay across workspace boundaries;
    response larger than 64,000 characters => bounded safe failure;

- [ ] Step 2: Run focused tests and verify failure

    npm test -- --run tests/ai-idempotency.test.ts tests/ai-idempotency-recovery.test.ts

Expected: FAIL because the route currently admits usage and calls the provider without a durable request record.

- [ ] Step 3: Implement fingerprinting and transactional begin

Canonicalize only validated/trusted request fields. Insert or lock the workspace-scoped record. Perform the existing durable admission in the same transaction only for the first logical request. Do not put prompt content in the idempotency row.

- [ ] Step 4: Implement sync provider completion and replay

Call LLMProvider only after IN_PROGRESS is durable. Encrypt and persist the bounded result or normalized error. Replays must return the existing safe response without provider invocation, quota admission, logging of response content, or cross-workspace lookup.

- [ ] Step 5: Implement stale recovery

Use bounded age and status guards to transition stale IN_PROGRESS rows to UNKNOWN. A process crash after provider success but before database completion must remain unknown and non-retryable for the same key.

- [ ] Step 6: Verify unit and integration behavior

    npm test -- --run tests/ai-idempotency.test.ts tests/ai-idempotency-recovery.test.ts tests/ai-idempotency.integration.test.ts tests/ai-generation-route.test.ts tests/ai-usage-admission.test.ts
    npm run typecheck
    npm run lint

Expected: duplicate provider calls are prevented and existing AI/RAG authorization tests remain green.

**Migration implications:** Requires the generated migration from Task 5 to be applied before integration tests.

**Security/regression considerations:** Preserve server-side membership checks, RAG bounds, provider abstraction, prompt redaction, safe errors, and M12 quota authority.

## Task 8: Implement explicit streaming idempotency contract

**Files:**

- Create: tests/ai-stream-idempotency.test.ts
- Modify: lib/ai/service.ts
- Modify: app/api/ai/generate/route.ts
- Modify: lib/security/errors.ts
- Modify: components/forms/ai-generation-panel.tsx if the current panel needs safe conflict copy

**Interfaces:**

- Consumes: Task 7 idempotency records and existing provider streaming interface.
- Produces: stream-specific transitions with no durable response replay.

- [ ] Step 1: Write failing stream tests

Assert that active duplicate, completed duplicate, known provider failure, process crash, and same-key fingerprint mismatch never invoke the provider twice. Assert stream chunks are not written to logs, audit metadata, operations projections, or queues.

- [ ] Step 2: Run the focused tests

    npm test -- --run tests/ai-stream-idempotency.test.ts

Expected: FAIL because the current stream path admits and forwards provider chunks without a durable stream state contract.

- [ ] Step 3: Add stream-only state transitions

Persist only state, safe error code, timestamps, and bounded metadata. Return AI_STREAM_NOT_REPLAYABLE after successful completion. Require a new key for a new attempt after UNKNOWN.

- [ ] Step 4: Verify route and UI behavior

    npm test -- --run tests/ai-stream-idempotency.test.ts tests/ai-generation-route.test.ts
    npm run typecheck
    npm run lint

Expected: streaming remains SSE-compatible and duplicate requests cannot cause uncontrolled provider execution.

**Migration implications:** Uses Task 5 status/mode columns; no additional migration expected.

**Security/regression considerations:** Do not merge stream and sync response caching into one unbounded response abstraction.

## Task 9: Add AI idempotency retention and recovery maintenance

**Files:**

- Create: tests/ai-idempotency-retention.test.ts
- Modify: lib/usage/retention.ts
- Modify: worker/workflow-scheduler.ts

**Interfaces:**

- Consumes: existing bounded scheduler cleanup and Task 7/8 terminal states.
- Produces: bounded deletion of terminal idempotency rows older than seven days and stale IN_PROGRESS recovery.

- [ ] Step 1: Write failing retention tests

Test that terminal rows older than the retention window are deleted in bounded batches, active rows are retained, stale in-progress rows become UNKNOWN, and cleanup is workspace-scoped and idempotent.

- [ ] Step 2: Run focused tests

    npm test -- --run tests/ai-idempotency-retention.test.ts tests/m12-retention.test.ts

Expected: FAIL until retention includes the new record class.

- [ ] Step 3: Implement cleanup

Use the existing scheduler maintenance path. Never include response plaintext in cleanup logs or return values. Keep retention bounded and do not delete unresolved rows before the retry/key-reuse horizon.

- [ ] Step 4: Verify scheduler integration

    npm test -- --run tests/ai-idempotency-retention.test.ts tests/m12-retention-recovery.test.ts
    npm run typecheck

**Migration implications:** None beyond Task 5.

**Security/regression considerations:** Do not shorten webhook, credential, audit, approval, or ambiguous-action retention as a side effect.

## Task 10: Harden worker/scheduler heartbeats and graceful drain

**Files:**

- Create: tests/worker-operability.test.ts
- Modify: lib/workflows/worker.ts
- Modify: lib/schedules/scheduler.ts
- Modify: scripts/check-worker-health.ts
- Modify: scripts/check-scheduler-health.ts
- Modify: worker/workflow-worker.ts
- Modify: worker/workflow-scheduler.ts

**Interfaces:**

- Consumes: existing Redis heartbeat TTLs, workflow leases, scheduler occurrence locks, and close methods.
- Produces: per-instance heartbeat keys, stale-instance detection, process-specific health, and bounded drain behavior.

- [ ] Step 1: Write failing operability tests

Cover unique heartbeat keys for two worker instances, stale TTL failure, scheduler replacement, dispatch stop during drain, active job completion, and forced termination leaving durable lease recovery.

- [ ] Step 2: Run focused tests

    npm test -- --run tests/worker-operability.test.ts tests/workflow-dispatch-recovery.test.ts tests/scheduling.integration.test.ts

Expected: FAIL for the current single-key heartbeat and limited drain contract.

- [ ] Step 3: Implement per-instance heartbeats and drain

Keep heartbeat values bounded to instance IDs. Preserve Redis failure behavior and existing PostgreSQL lease/occurrence authority. Do not create a second workflow execution engine.

- [ ] Step 4: Verify process health

    npm test -- --run tests/worker-operability.test.ts
    npm run typecheck
    npm run lint
    docker compose up -d --build worker scheduler
    docker compose exec worker npm run worker:health
    docker compose exec scheduler npm run scheduler:health

Expected: each process reports its own healthy heartbeat; stopping one instance does not erase another instance’s status.

**Migration implications:** None; heartbeat fleet state remains Redis operational state.

**Security/regression considerations:** Do not expose heartbeat values or Redis credentials through public API responses.

## Task 11: Add vendor-neutral production metrics and readiness diagnostics

**Files:**

- Create: lib/observability/metrics.ts
- Create: tests/metrics-contract.test.ts
- Modify: lib/http.ts
- Modify: lib/health/readiness.ts
- Modify: lib/usage/admission.ts
- Modify: lib/workflows/outbox.ts
- Modify: lib/workflows/worker.ts
- Modify: lib/schedules/scheduler.ts
- Modify: lib/ai/service.ts
- Modify: lib/integrations/actions.ts
- Modify: lib/observability/logger.ts

**Interfaces:**

- Consumes: existing correlation IDs, redaction, safe errors, readiness, operations, and audit events.
- Produces: MetricSink.increment, MetricSink.observe, MetricSink.gauge, and a structured/no-op implementation with bounded labels.

- [ ] Step 1: Write metric contract tests

Assert allowed metric names, bounded label keys/values, omission of prompts/responses/secrets/workspace IDs as high-cardinality labels, and redacted error fields.

- [ ] Step 2: Run focused tests

    npm test -- --run tests/metrics-contract.test.ts tests/observability-redaction.test.ts tests/health-readiness.test.ts

Expected: FAIL because no metric interface exists.

- [ ] Step 3: Implement the interface and minimum event coverage

Instrument HTTP failures/latency, readiness failures, outbox transitions, workflow outcomes, worker throughput, scheduler lag, admission decisions, concurrency saturation, AI idempotency/provider outcomes, and integration outcomes. Keep labels low-cardinality and preserve redaction.

- [ ] Step 4: Verify

    npm test -- --run tests/metrics-contract.test.ts tests/observability-redaction.test.ts tests/health-readiness.test.ts
    npm run typecheck
    npm run lint

Expected: metric events are safe and no vendor SDK is required.

**Migration implications:** None.

**Security/regression considerations:** Metrics must not become a side channel for workspace IDs, prompts, responses, credential IDs, raw URLs, or provider payloads.

## Task 12: Add migration preflight and backup/restore tooling

**Files:**

- Create: scripts/db-preflight.ts
- Create: scripts/backup-postgres.ps1
- Create: scripts/restore-drill.ps1
- Create: tests/migration-preflight.test.ts
- Create: tests/backup-restore-contract.test.ts
- Modify: lib/database/migrate.ts
- Modify: package.json

**Interfaces:**

- Consumes: existing Drizzle migrator, getSql(), health checks, Docker Compose service names, and environment validation.
- Produces: preflight checks, advisory-locked migration execution, backup command contract, and an isolated restore drill.

- [ ] Step 1: Write failing preflight and script contract tests

Test connectivity, migration journal visibility, current/target migration ordering, advisory-lock behavior, no-reset command construction, backup filename redaction, restore isolation, and keyring requirement checks.

- [ ] Step 2: Run focused tests

    npm test -- --run tests/migration-preflight.test.ts tests/backup-restore-contract.test.ts

Expected: FAIL because the preflight and restore-drill commands do not exist.

- [ ] Step 3: Implement migration preflight and advisory lock

Do not use db:push. The migrator must fail on connectivity, lock, journal, or migration errors and return non-zero without resetting state.

- [ ] Step 4: Implement backup and isolated restore commands

The backup command uses operator-supplied secure connection details and writes to an explicit destination. The restore drill uses a temporary database/container, matching keyrings supplied out-of-band, verifies row counts/readiness/decryption/outbox state, and cleans only its own temporary target after evidence is recorded.

- [ ] Step 5: Run the commands against a clean temporary database

    npm run db:preflight
    npm run db:migrate
    .\scripts\backup-postgres.ps1 -Help
    .\scripts\restore-drill.ps1 -Help

Expected: preflight and migration succeed without touching the existing development volume; help paths do not require credentials or perform destructive actions.

- [ ] Step 6: Perform the actual isolated restore drill

Create a backup from the current database, restore into a temporary database, run the generated migration chain, verify M1–M12/M13 records and encrypted material, run readiness, and record RPO/RTO evidence. Do not claim backup readiness before this passes.

**Migration implications:** The generated M13 migration must pass both clean and existing-database paths before release.

**Security/regression considerations:** Never print DSNs, passwords, keyrings, ciphertext plaintext, or backup contents. Never target the existing development database for restore.

## Task 13: Add GitHub CI, security, and release-artifact workflows

**Files:**

- Create: .github/workflows/ci.yml
- Create: .github/workflows/security.yml
- Create: .github/workflows/release-artifact.yml
- Modify: package.json only for explicit verification scripts required by CI
- Create: tests/ci-contract.test.ts

**Interfaces:**

- Consumes: package scripts, clean migration commands, production Dockerfile, Compose config, dependency lockfile, and security policy.
- Produces: pull-request/push validation, security scanning, and manual content-addressed artifact build without automatic production deployment.

- [ ] Step 1: Write workflow contract tests

Assert that workflows run npm ci, typecheck, lint, tests, clean/current migration verification, build, production image build, Compose config, dependency audit policy, secret scan, and image scan. Assert no workflow performs production deployment or database reset.

- [ ] Step 2: Run contract tests

    npm test -- --run tests/ci-contract.test.ts

Expected: FAIL because the workflows do not exist.

- [ ] Step 3: Implement CI workflow

Use pinned actions where possible, PostgreSQL/Redis service containers, a disposable clean database, and uploaded test/migration artifacts. Keep Ollama-heavy integration tests in an explicitly guarded job rather than making the default unit job silently depend on a model download.

- [ ] Step 4: Implement security workflow

Run lockfile-based audit policy, secret scanning, and container/image scanning. Critical findings fail. High findings fail unless the repository contains a time-bound reviewed exception with owner and expiry. Do not run automatic audit fixes.

- [ ] Step 5: Implement manual release artifact workflow

Build and scan the production image, record the commit SHA and immutable digest, and upload SBOM/build metadata. Do not deploy, run migrations, or change production state.

- [ ] Step 6: Verify workflow syntax and local-equivalent commands

    npm test -- --run tests/ci-contract.test.ts
    npm run typecheck
    npm run lint
    npm test -- --run
    npm run build
    docker compose -f docker-compose.production.yml config

Expected: workflow contracts and local equivalents pass.

**Migration implications:** CI must apply generated migrations to clean and disposable current-schema databases; it must not reset the shared development database.

**Security/regression considerations:** Pin third-party actions by reviewed version/SHA where policy permits. Never place provider secrets in pull-request jobs.

## Task 14: Add production operational runbooks and synchronize documentation

**Files:**

- Create: docs/operations/deployment.md
- Create: docs/operations/rollback.md
- Create: docs/operations/migrations.md
- Create: docs/operations/backup-restore.md
- Create: docs/operations/secret-rotation.md
- Create: docs/operations/incident-response.md
- Create: docs/operations/worker-scheduler.md
- Create: docs/operations/dependency-vulnerability-response.md
- Modify: README.md
- Modify: SETUP.md
- Modify: ARCHITECTURE.md
- Modify: SECURITY.md
- Modify: AI.md

**Interfaces:**

- Consumes: final runtime, migration, backup, idempotency, health, metrics, and CI behavior from Tasks 1–13.
- Produces: operator-facing procedures with no undocumented command or secret-handling assumption.

- [ ] Step 1: Write documentation acceptance checks

Use a documentation test or review checklist that fails when required topics are absent: production/local distinction, M12/M13 architecture, M10/M11 stale references, no-volume-reset rule, migration immutability, secret rotation, AI stream contract, backup restore, private networking, and M14 exclusions.

- [ ] Step 2: Run the checks before documentation changes

    rg -n "Milestone 10 boundary|Milestone 11|M13|backup|restore|private network|AI_STREAM_NOT_REPLAYABLE" README.md SETUP.md ARCHITECTURE.md SECURITY.md AI.md

Expected: the current stale references and missing production procedures are visible.

- [ ] Step 3: Write the runbooks

Each runbook must include prerequisites, exact safe commands, expected outputs, stop conditions, rollback/forward-fix rules, secret handling, and post-operation verification. The restore runbook must link to the actual drill and state that backup readiness is unclaimed until the drill passes.

- [ ] Step 4: Update the five project documents

Correct stale milestone headings and dashboard/runtime claims. Preserve local development instructions and explain that production Compose is a controlled deployment reference, not a high-availability guarantee.

- [ ] Step 5: Run documentation sanity checks

    rg -n -i "Milestone 10 boundary|Milestone 11 adds|M13|production|backup|restore|rollback|stream" README.md SETUP.md ARCHITECTURE.md SECURITY.md AI.md docs/operations
    git diff --check

Expected: no stale M10/M11 current-state claims remain; operational procedures are linked and safe.

**Migration implications:** None.

**Security/regression considerations:** Documentation must never contain real secrets, tokens, ciphertext plaintext, or production DSNs.

## Task 15: Final verification and release-readiness gate

**Files:**

- Modify: scripts/verify-local.ps1 only for non-destructive M13 checks that preserve local behavior.
- Test: all existing tests and all new M13 tests.

**Interfaces:**

- Consumes: every implementation task and both the existing database and a clean temporary database.
- Produces: evidence that M13 is ready for a separate commit/approval decision.

- [ ] Step 1: Verify repository and migration boundaries

    git status --short --branch --untracked-files=all
    git diff --check
    Get-ChildItem db/migrations | Sort-Object Name
    rg -n -i "milestone 14|M14|generic HTTP|arbitrary URL|browser automation|shell execution" app lib worker scripts docker docker-compose.production.yml

Expected: only approved M13 files are changed; migrations 0000–0013 are unchanged; no M14 or forbidden capability exists.

- [ ] Step 2: Run required static verification

    npm ci
    npm run typecheck
    npm run lint
    npm test -- --run
    npm run build

Expected: all commands pass with the lockfile unchanged unless a separately approved dependency task was completed.

- [ ] Step 3: Verify clean and existing database paths

    npm run db:preflight
    npm run db:migrate

Also run the clean temporary database migration and schema contract suite without resetting the existing development volume.

- [ ] Step 4: Verify production artifact and runtime

    docker compose config
    docker compose -f docker-compose.production.yml config
    docker compose -f docker-compose.production.yml build
    docker compose -f docker-compose.production.yml up -d
    docker compose -f docker-compose.production.yml ps

Expected: production services use the immutable image, private dependency ports, production configuration, health checks, and one-shot migration flow.

- [ ] Step 5: Verify local M1–M12 regression behavior

    .\scripts\verify-local.ps1

Expected: existing local Docker volumes are preserved and health, Ollama, pgvector/RAG, agents, workflows, schedules, webhooks, approvals, editor, integrations, and M12 controls remain green.

- [ ] Step 6: Verify targeted reliability/security scenarios

Run the focused AI idempotency, crash/recovery, worker operability, metrics redaction, migration, backup/restore, CI contract, cross-workspace isolation, Redis outage, outbox, reservation, scheduler, approval, and terminal AMBIGUOUS tests.

Expected: duplicate provider execution is prevented for same-key sync requests; streaming duplicates never replay; unknown outcomes are not retried automatically; no secrets appear in logs, queues, prompts, snapshots, audit metadata, or responses.

- [ ] Step 7: Record release evidence without committing

    git status
    git diff --stat
    git diff --check

Expected: the implementation branch is ready for an explicit M13 commit approval, with no automatic push or deployment.

**Migration implications:** Final evidence must include clean and existing databases, generated migration review, and restore drill results.

**Security/regression considerations:** A failed backup restore, unresolved critical/high vulnerability without an approved exception, public internal service port, invalid startup configuration, duplicate AI provider call, or any M1–M12 regression blocks M13 completion.

---

## Verification matrix

| Area | Required evidence | Blocking failure |
| --- | --- | --- |
| Static quality | typecheck, lint, full tests, build | Any failure |
| Migrations | clean DB and existing DB apply generated chain | Reset, drift, or failed migration |
| Runtime | production image, Compose config, health, private ports | Dev server, exposed dependency, or unhealthy service |
| Configuration | every role rejects unsafe production values | Any silent insecure startup |
| AI idempotency | sync replay, stream conflict, crash recovery, quota dedupe | Duplicate uncontrolled provider call |
| Workflow recovery | outbox, lease, reservation, scheduler, approval, integration tests | Lost durable state or automatic ambiguity retry |
| Security | secret scan, dependency policy, image scan, redaction tests | Secret leak or unreviewed critical/high finding |
| Data recovery | backup and isolated restore drill | Restore not tested or keyring mismatch unexplained |
| Operations | health, heartbeats, drain, metrics, runbooks | No detectable worker/scheduler failure |
| Regression | verify-local.ps1 and M1–M12 tests | Any existing feature/security regression |
| Scope | M13 files only, no M14 capability | Any new product or generic network boundary |

## Commit boundaries for the future implementation phase

Use small independently reviewable commits, for example:

1. feat: enforce production runtime configuration
2. feat: add production runtime image and compose reference
3. feat: add durable AI request idempotency
4. feat: add worker scheduler operability metrics
5. feat: add migration backup and restore gates
6. ci: add production validation and security gates
7. docs: add production operations runbooks

Do not commit any implementation until the user explicitly approves the M13 implementation phase. Do not push automatically.

## Plan self-review

- Scope coverage: runtime, configuration, network/TLS, CI/CD, dependencies, migrations, backup/restore, AI idempotency, crash recovery, worker/scheduler, observability, runbooks, security invariants, verification, documentation, and M14 exclusion each have dedicated tasks.
- Migration safety: only a generated M13 migration is planned; existing migrations remain immutable; clean/current database checks are explicit.
- Streaming safety: stream requests have a separate non-replayable contract and are not merged with sync response replay.
- Trust boundaries: no new generic HTTP, OAuth, connector, browser, filesystem, shell, SQL, or code-execution boundary is introduced.
- Retry semantics: PostgreSQL remains authoritative, AMBIGUOUS remains terminal, and at-least-once workflow behavior remains explicit.
- Placeholder scan: no task depends on an unspecified future choice; deployment vendor selection remains intentionally deployment-specific and the required interface/verification contract is explicit.

**Plan status:** Ready for M13 implementation approval.
