# Milestone 15 Release Candidate and Beta Validation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to execute this plan task-by-task. Every task has an independent evidence gate and commit boundary.

**Goal:** Produce auditable evidence that the M1–M14 Flowyn baseline can become a controlled v1.0
release candidate, survive representative failures, preserve security boundaries, and complete a
time-bounded beta.

**Architecture:** Preserve the existing Better Auth, workspace authorization, PostgreSQL/Drizzle,
Redis/BullMQ, transactional outbox, scheduler, LLMProvider, RAG, AgentRunner, workflow, webhook,
approval, Slack vault, observability, and Docker boundaries. Apply only narrow, test-backed release
fixes identified by evidence.

**Tech Stack:** Next.js 16.3.1, TypeScript, Vitest, Playwright, axe, Docker Compose, PostgreSQL
16 with pgvector, Redis 7, Ollama, Drizzle migrations 0000–0014, npm lockfile, and the existing
PowerShell verification scripts.

**Spec:** docs/superpowers/specs/2026-08-15-milestone-15-release-candidate-validation-design.md

## Global constraints

- M15 is validation and release hardening; it is not a product-feature milestone.
- Do not start M16.
- Do not weaken readiness, workspace authorization, credential redaction, approval, or ambiguous
  integration semantics to make a gate pass.
- Do not add generic HTTP, OAuth, uploads, shell, arbitrary SQL, filesystem, eval, dynamic code,
  runtime browser automation, or unrestricted network access.
- Keep local development Compose behavior and existing Docker volumes intact.
- Do not reset the existing database or volumes.
- Generate and review Drizzle migrations only if a separately approved narrow fix proves one is
  required. No M15 design task presumes a migration.
- Do not install dependencies, browser engines, or load tools without explicit implementation
  approval.
- Every implementation task begins with a failing or boundary-focused test or an evidence
  procedure that proves the current behavior.
- Every task records commit SHA, environment, command, timestamp, result, and rollback impact.
- No task may use real Slack credentials outside the dedicated controlled Slack task.
- AMBIGUOUS integration results are terminal and are never automatically retried.
- RC approval is impossible without evidence for every mandatory gate.

## Release gates

### Gate A — Pre-RC qualification

Required: frozen source baseline; local and clean-database tests; immutable image evidence; supply
chain evidence; model provisioning and embedding dimension; deployment and migration rehearsal;
backup and isolated restore; failure recovery; bounded performance; browser and accessibility;
security, isolation, and redaction review; and controlled network validation.

### Gate B — RC.1 approval

Required: all Gate A evidence linked to one commit and image digest, no unresolved P0 or P1 defect,
known P2 disposition, rollback rehearsal, release owner approval, and a declared environment.
Creating a tag is a separate authorized action and is not part of this plan execution.

### Gate C — Beta exit

Required: separate beta environment, 3–10 workspaces, 5–20 users, 7–14 days of monitoring,
verified backups, incident response, feedback review, no unresolved P0 or P1 defect, and explicit
disposition of P2 findings.

### Gate D — Final v1.0

Required: beta exit, dedicated Slack validation, final recovery and rollback evidence, supply-chain
and dependency disposition, security sign-off, stable operations, and explicit final approval.

## Phase 1 — Baseline and regression evidence

### Task 1 — Freeze the source and evidence baseline

**Objective:** Establish an immutable M14 baseline before any release fix.

**Expected files:** No repository files. Create evidence outside the source tree or in the approved
release evidence store.

**Tests/evidence first:**

- Capture git status, branch, HEAD, origin/master, and recent history.
- Confirm M1–M14 commits and the v0.13.0 historical tag.
- Record the exact dependency lockfile hash and Docker Compose configuration hash.

**Implementation changes:** None.

**Migration implications:** None. Do not run a reset or down-migration.

**Verification commands:**

~~~powershell
git status --short --branch
git log --oneline --decorate -20
git tag --list
git diff --check
docker compose config --quiet
~~~

**Expected result:** Clean master at the agreed M14 SHA, synchronized with origin/master, with no
untracked runtime artifacts treated as release files.

**Security/regression considerations:** A release cannot silently include local credentials, ignored
logs, temporary databases, build output, or unrelated work.

**Rollback/recovery:** No mutation. If the baseline is not clean, stop and resolve scope before
continuing.

**Acceptance:** Evidence identifies one exact source baseline and no M15 implementation is mixed in.

**Commit-worthy:** No.

### Task 2 — Run the complete M1–M14 static, unit, integration, build, and local runtime suite

**Objective:** Reconfirm the product baseline before release-specific changes.

**Expected files:** No source changes. Test reports are external evidence; ignored runtime output
must not be committed.

**Tests/evidence first:** Run the existing test and verification commands exactly as documented.

**Implementation changes:** None unless a reproducible failure is classified and assigned to a later
narrow fix task.

**Migration implications:** Use the existing database for non-destructive checks and a disposable
clean database for migration checks. Preserve existing volumes.

**Verification commands:**

~~~powershell
npm ci
npm run typecheck
npm run lint
npm test -- --run
npm run build
docker compose config
docker compose up -d --build
docker compose ps
.\scripts\verify-local.ps1
~~~

**Expected result:** Existing M14 evidence remains reproducible, including the reported 173 test
files and 508 passing tests, 21 Playwright tests, build, Docker, and local verification.

**Security/regression considerations:** A skipped prerequisite is a failure, not a pass. Confirm
workspace isolation, credential redaction, fixed Slack operation, and no application browser
runtime capability.

**Rollback/recovery:** Stop services only through the documented local workflow; do not remove
volumes or reset databases.

**Acceptance:** Baseline is green or every failure is recorded with a release severity and owner.

**Commit-worthy:** No.

## Phase 2 — Narrow release correctness fixes

### Task 3 — Close raw operational error logging paths

**Objective:** Ensure startup, migration, and AI persistence failures use the existing structured
redacted logger without losing operator diagnostics.

**Expected files:** Start with tests in tests/observability-redaction.test.ts and a focused
tests/runtime-error-logging.test.ts. Possible narrow implementation files are
lib/database/migrate.ts, worker/workflow-worker.ts, and lib/ai/service.ts. Update only directly
related operational documentation if behavior changes.

**Tests/evidence first:**

- Add failing assertions that thrown errors with credentials, connection strings, authorization
  headers, tokens, or nested causes are redacted.
- Assert structured fields preserve safe error category, component, correlation ID, and stack
  policy without serializing raw error objects.
- Assert migration, worker startup, and AI persistence paths call the redacted logger.

**Implementation changes:** Replace only reproduced raw console logging with the existing logger
abstraction. Preserve operator-safe context and existing failure behavior.

**Migration implications:** None.

**Verification commands:**

~~~powershell
npm test -- --run tests/observability-redaction.test.ts tests/runtime-error-logging.test.ts
npm run typecheck
npm run lint
npm test -- --run
~~~

**Expected result:** No sensitive error value reaches logs, browser responses, audit metadata, AI
prompts, queue payloads, or workflow output.

**Security/regression considerations:** Do not blanket-delete diagnostics or log a serialized error.
Use the existing redaction contract and test nested causes and provider errors.

**Rollback/recovery:** Revert only the narrow logging change if operator diagnostics regress; the
original durable failure state must remain unchanged.

**Acceptance:** Focused redaction tests and the full suite pass, with a before/after evidence sample.

**Commit-worthy:** Yes, as a narrow release-hardening commit if implementation is authorized.

### Task 4 — Align migration preflight behavior and documentation

**Objective:** Make release preflight claims match actual checks and add only the minimum safety
checks required for deployment.

**Expected files:** Tests/migration-preflight.test.ts first; possible scripts/db-preflight.ts and
the relevant deployment or migration documentation. No migration is expected.

**Tests/evidence first:**

- Assert connectivity and migration journal checks.
- Assert expected migration set 0000–0014 is checked.
- Assert the existing workspace and AI idempotency invariants remain checked.
- If database version, capacity, or deployment target checks are retained in documentation, add
  a test-backed implementation for each; otherwise narrow the documentation to implemented facts.

**Implementation changes:** Improve preflight only where a failing safety assertion demonstrates the
need. Keep PostgreSQL authoritative and preserve advisory lock 7130413.

**Migration implications:** No schema change. Run the current database check and a clean temporary
database check without resetting the existing environment.

**Verification commands:**

~~~powershell
npm test -- --run tests/migration-preflight.test.ts
npm run typecheck
npm run lint
node scripts/db-preflight.ts
~~~

**Expected result:** Preflight rejects missing or unexpected migration state before traffic is
admitted and does not claim checks it does not perform.

**Security/regression considerations:** Never log DATABASE_URL or connection details. Do not bypass
the advisory lock or make Redis the schema authority.

**Rollback/recovery:** Revert preflight-only code if it blocks a valid existing deployment; retain
the evidence gap and fix the documentation rather than weakening the check.

**Acceptance:** Current and clean database preflight evidence is consistent with the docs.

**Commit-worthy:** Yes, if code changes are required.

## Phase 3 — Artifact and supply-chain qualification

### Task 5 — Define the immutable production image contract

**Objective:** Ensure production uses the exact image that was built, scanned, and approved.

**Expected files:** Start with tests/production-artifact-contract.test.ts. Possible implementation
files are docker-compose.production.yml, .github/workflows/release-artifact.yml, and deployment
documentation. Local docker-compose.yml must remain development-compatible.

**Tests/evidence first:**

- Assert migrator, app, worker, and scheduler consume one FLOWYN_IMAGE value.
- Assert the production file does not silently build a different image when a release digest is
  supplied.
- Assert a digest is preferred or required for release deployment.
- Assert local Compose retains its current build and volume behavior.

**Implementation changes:** Make the smallest production-only Compose and release-workflow change
that consumes the published immutable digest and records it in evidence.

**Migration implications:** None.

**Verification commands:**

~~~powershell
npm test -- --run tests/production-artifact-contract.test.ts
docker compose -f docker-compose.production.yml config
~~~

**Expected result:** Production deployment is reproducible from one digest; local development is
unchanged.

**Security/regression considerations:** Do not accept an untrusted image override, mix image tags,
or expose registry credentials in Compose or logs.

**Rollback/recovery:** Redeploy the prior approved digest. Do not use down-migrations.

**Acceptance:** The digest in deployment evidence equals the digest inspected and scanned.

**Commit-worthy:** Yes, if implementation is authorized and tests pass.

### Task 6 — Complete supply-chain evidence without unrelated upgrades

**Objective:** Produce dependency, image, SBOM, provenance, action-input, and production-tree
evidence.

**Expected files:** Usually no application source changes. Possible narrow files are
 .github/workflows/ci.yml, .github/workflows/security.yml, .github/workflows/release-artifact.yml,
 docker/production.Dockerfile, and supply-chain documentation.

**Tests/evidence first:**

- Install from the committed lockfile with npm ci.
- Inspect production dependency tree independently from dev tooling.
- Run npm audit with the recorded result.
- Build the release image and inspect its digest and package contents.
- Run the configured image scan and generate SBOM/provenance evidence.
- Record mutable action refs and mutable base/container tags as release risks.

**Implementation changes:** Only approved pinning or workflow evidence improvements. Do not run npm
audit fix, upgrade Next or React, alter unrelated direct dependencies, or regenerate the lockfile
without separate authorization.

**Migration implications:** None.

**Verification commands:**

~~~powershell
npm ci
npm audit --omit=dev --audit-level=high
npm ls --omit=dev
docker build -f docker/production.Dockerfile .
~~~

**Expected result:** The baseline remains at zero critical, zero high, four moderate, and zero low
findings unless a separately reviewed change alters that result.

**Security/regression considerations:** The current moderate esbuild chain through Drizzle tooling
must receive a dated disposition. No forced remediation is allowed in this task.

**Rollback/recovery:** Revert only supply-chain metadata changes that are not necessary for the
approved artifact; retain evidence of unresolved findings.

**Acceptance:** Artifact, SBOM, provenance, scan, and audit results identify the same source and
digest.

**Commit-worthy:** Yes only for an authorized narrow workflow or Docker hardening change.

### Task 7 — Provision and verify production Ollama models

**Objective:** Prove AI-required operations have the models and embedding dimension required by the
current application.

**Expected files:** No application or model code. Possible operator runbook or deployment
documentation changes only.

**Tests/evidence first:**

- Verify the persistent Ollama volume is present.
- Pull or provision llama3.2:3b and nomic-embed-text in the production-like environment.
- Query model listing and the API.
- Generate one controlled response.
- Embed one controlled input and verify dimension 768 from the actual response.
- Restart Ollama and verify models remain available.

**Implementation changes:** None unless an already approved provisioning contract needs a narrow
documentation correction. Do not weaken readiness.

**Migration implications:** None.

**Verification commands:**

~~~powershell
docker compose -f docker-compose.production.yml exec ollama ollama list
Invoke-RestMethod http://localhost:11434/api/tags
~~~

**Expected result:** Both models are present, generation and embedding work, dimension matches the
schema, and the model volume survives restart.

**Security/regression considerations:** Do not include model credentials or prompts containing
secrets in evidence. Missing models block AI-required release claims.

**Rollback/recovery:** Reprovision models from the approved model list; do not delete the existing
Ollama volume during a drill.

**Acceptance:** Model and dimension evidence is attached to the exact release environment.

**Commit-worthy:** No unless documentation alone is separately approved.

## Phase 4 — Deployment and network rehearsal

### Task 8 — Rehearse immutable production deployment

**Objective:** Deploy the approved image to a production-like environment with a migrator-first
sequence and verified readiness.

**Expected files:** No source changes. Deployment transcript and health evidence are external.

**Tests/evidence first:** Validate the digest, Compose interpolation, secret references, network
attachment, volumes, migration order, and health endpoints before starting services.

**Implementation changes:** None; any discovered contract defect returns to Task 5.

**Migration implications:** Run migrations 0000–0014 using the existing migrator and advisory lock.
Verify current and clean temporary databases independently.

**Verification commands:**

~~~powershell
docker compose -f docker-compose.production.yml config
docker compose -f docker-compose.production.yml up -d migrator
docker compose -f docker-compose.production.yml up -d app worker scheduler
docker compose -f docker-compose.production.yml ps
~~~

**Expected result:** One approved image is used, migration state is current, app is ready for
non-AI traffic, worker and scheduler are healthy, and AI-required readiness reflects model state.

**Security/regression considerations:** Do not print secret environment values. Confirm private
PostgreSQL, Redis, and Ollama remain unreachable from untrusted clients.

**Rollback/recovery:** Stop admission, capture evidence, redeploy the prior digest, and restore
only when data compatibility requires it.

**Acceptance:** A clean deployment transcript and a current-database transcript both pass.

**Commit-worthy:** No.

### Task 9 — Establish the controlled worker-only Slack egress path

**Objective:** Prove the fixed Slack connector can reach its approved destination without turning
Flowyn into a generic HTTP subsystem.

**Expected files:** Start with tests/production-network-contract.test.ts. Possible implementation
files are docker-compose.production.yml and deployment/network documentation.

**Tests/evidence first:**

- Assert only the worker receives the controlled egress network.
- Assert app, PostgreSQL, Redis, and Ollama remain on private networks.
- Assert egress remains disabled by default.
- Assert the connector operation registry still contains only Slack post_message.

**Implementation changes:** Add only the approved worker egress attachment or explicit host/NAT
policy. Do not add an unrestricted proxy, arbitrary destination field, or network helper.

**Migration implications:** None.

**Verification commands:**

~~~powershell
npm test -- --run tests/production-network-contract.test.ts
docker compose -f docker-compose.production.yml config
~~~

**Expected result:** The worker has a narrowly controlled route to the Slack API, while all other
services remain private and no application generic HTTP capability exists.

**Security/regression considerations:** Recheck SSRF, credential, DNS, proxy, and egress policy
boundaries. Keep INTEGRATION_EGRESS_ENABLED=false in all default files.

**Rollback/recovery:** Remove the egress attachment and leave integration egress disabled if any
destination or isolation check is unclear.

**Acceptance:** Network evidence and static connector tests prove the intended trust boundary.

**Commit-worthy:** Yes, if the production-only network change is authorized.

## Phase 5 — Database, backup, and restore

### Task 10 — Validate migrations on clean and existing databases

**Objective:** Prove migration reproducibility and current-database safety.

**Expected files:** No migration changes. External SQL output, schema checks, and transcripts.

**Tests/evidence first:** Create a disposable temporary PostgreSQL database or isolated container,
apply 0000–0014, inspect the journal and key invariants, then run preflight against the existing
database without reset.

**Implementation changes:** None. A failure becomes a migration or preflight defect, not permission
to hand-edit generated SQL.

**Migration implications:** Do not create a new M15 migration. Preserve advisory lock 7130413 and
Drizzle journal order.

**Verification commands:**

~~~powershell
npm run db:migrate
node scripts/db-preflight.ts
~~~

**Expected result:** Clean and existing databases both reach the same expected migration state,
with no data reset and no schema drift.

**Security/regression considerations:** Temporary DATABASE_URL values remain outside committed
files and logs.

**Rollback/recovery:** Drop only the explicitly named temporary database after evidence capture.
Never drop the existing development database.

**Acceptance:** Migration evidence includes all 0000–0014 files, journal consistency, and invariant
checks.

**Commit-worthy:** No.

### Task 11 — Execute the isolated encrypted backup and restore drill

**Objective:** Measure recovery against the single-host RPO 24-hour and RTO 2-hour target.

**Expected files:** No application changes. Backup identifiers, checksums, restore transcript, and
invariant report are external evidence.

**Tests/evidence first:** Run the existing backup script, verify encryption and external key custody,
restore to a separately named temporary target, and compare authorized durable invariants.

**Implementation changes:** None unless a reproducible script defect is found and approved.

**Migration implications:** Restore the migration journal and schema as a unit; do not run destructive
down-migrations.

**Verification commands:**

~~~powershell
.\scripts\backup-postgres.ps1
.\scripts\restore-postgres.ps1
~~~

**Expected result:** Restore completes within 2 hours, backup age is within 24 hours, credentials
remain encrypted, and workspace, workflow, approval, webhook, integration, audit, and usage state
is coherent.

**Security/regression considerations:** Restore only to an explicitly confirmed isolated target.
Keep encryption keys outside the repository and application logs.

**Rollback/recovery:** Delete or discard only the isolated restore target after verification.
Preserve the source database and production volumes.

**Acceptance:** RPO/RTO, checksum, key custody, and post-restore health evidence pass.

**Commit-worthy:** No.

## Phase 6 — Crash and recovery validation

### Task 12 — Run the deterministic failure and recovery matrix

**Objective:** Prove durable state, idempotency, retry, and recovery behavior across M6–M14.

**Expected files:** Start with tests/m15-recovery-contract.test.ts and reuse existing workflow,
outbox, scheduler, webhook, approval, and integration recovery tests. Implementation files are not
expected unless a test proves a narrow defect.

**Tests/evidence first:** Inject or simulate, one at a time:

- worker crash before and after durable workflow transition;
- scheduler restart around outbox dispatch;
- Redis outage and recovery;
- stale worker lease expiration;
- duplicate webhook delivery;
- approval expiry and late human response;
- integration timeout with known failure;
- integration timeout with AMBIGUOUS outcome;
- database restart during a durable transaction;
- Ollama outage and model reprovisioning.

**Implementation changes:** Preserve existing state machines. Add only focused fixes that maintain
at-least-once dispatch and durable deduplication.

**Migration implications:** None.

**Verification commands:**

~~~powershell
npm test -- --run tests/m15-recovery-contract.test.ts
npm test -- --run tests/workflow* tests/outbox* tests/webhook* tests/approval* tests/integration*
~~~

**Expected result:** Each scenario converges to the documented final state, never double-counts a
domain operation, and never retries AMBIGUOUS.

**Security/regression considerations:** Assert workspace identity on every recovered record and
ensure secrets are absent from payload and log snapshots.

**Rollback/recovery:** Restore only disposable test data. For a real failure, follow the existing
incident and rollback runbooks.

**Acceptance:** The matrix contains before-state, injected failure, observed state, recovery action,
and final invariant for every scenario.

**Commit-worthy:** Yes only if focused tests or fixes are needed.

## Phase 7 — Performance qualification

### Task 13 — Run the bounded non-AI load profile

**Objective:** Characterize core API and durable execution capacity under the initial M15 profile.

**Expected files:** External load harness and report. A narrow contract test may be added only if
the approved harness requires it; do not install a load tool in this planning phase.

**Tests/evidence first:** Use 20 authenticated concurrent users and 5 requests per second for
10 minutes against representative reads, writes, workflow acknowledgement, webhook, approval,
and operations routes.

**Implementation changes:** None unless evidence identifies a reproducible bounded defect.

**Migration implications:** Use isolated seeded data and a disposable database when writes are
required.

**Verification commands:** Record the approved harness command, environment, seed, and output in
the evidence index. Also run:

~~~powershell
npm run typecheck
npm run lint
npm test -- --run
~~~

**Expected result:** Read p95 is at most 750 ms, read p99 at most 1.5 s, workflow acknowledgement
p95 at most 1 s, webhook p95 at most 750 ms, error rate below 1 percent, and backlog drains within
5 minutes without pool exhaustion or cross-workspace results.

**Security/regression considerations:** Use synthetic accounts and data. Never use customer data,
real Slack tokens, or unrestricted external destinations.

**Rollback/recovery:** Stop the harness and clean only its temporary data and queues.

**Acceptance:** The report includes percentiles, errors, saturation, queue backlog, database pool,
and workspace-isolation observations.

**Commit-worthy:** No unless a separately approved narrow fix is required.

### Task 14 — Characterize Ollama generation and embedding performance

**Objective:** Establish hardware-specific AI latency and failure evidence without making a false
universal SLO.

**Expected files:** External report and model provisioning transcript.

**Tests/evidence first:** Measure generation and embedding latency by model, input size,
concurrency, timeout, queue behavior, and restart state.

**Implementation changes:** None unless a documented timeout or readiness defect is reproduced.

**Migration implications:** None. Verify embedding dimension remains 768.

**Verification commands:** Record the controlled AI harness command and all model and hardware
details in the evidence index.

**Expected result:** AI-required readiness is meaningful, timeouts are categorized, and missing
models remain a provisioning failure rather than a hidden degraded pass.

**Security/regression considerations:** Prompts and documents are synthetic and contain no secrets.

**Rollback/recovery:** Reprovision the persistent Ollama volume; do not alter RAG schema to fit a
different unverified dimension.

**Acceptance:** The report states capacity limits and operational behavior for the exact deployment
hardware.

**Commit-worthy:** No.

## Phase 8 — Browser and accessibility qualification

### Task 15 — Expand the Playwright browser matrix

**Objective:** Validate critical workflows in Chromium, Firefox, and WebKit without adding runtime
browser automation.

**Expected files:** Existing playwright.config.ts and focused E2E specs only after implementation
approval. Browser reports, screenshots, and traces stay outside version control.

**Tests/evidence first:** Configure or run critical smoke paths on all three engines at 1280 px and
375 px. Keep the exhaustive M14 suite on Chromium at 375, 768, and 1280 px.

**Implementation changes:** Make only test configuration or selectors required by reproducible
cross-engine failures. Do not change product authorization or workflow semantics to satisfy a test.

**Migration implications:** None. Use the disposable E2E database path and remove it after the run.

**Verification commands:**

~~~powershell
npx playwright test
~~~

**Expected result:** Authentication, workspace switch, editor validation/save, execution, approval,
webhook, integration redaction, operations, and error-state smoke paths pass on all three engines.

**Security/regression considerations:** No real credentials or Slack tokens. Verify browser
responses never contain secret material.

**Rollback/recovery:** Revert only test-only changes when a selector or engine issue is not a
product defect. Do not commit reports or traces.

**Acceptance:** Engine, version, viewport, and result are recorded for every critical path.

**Commit-worthy:** Yes only for approved test-only changes or a narrow product accessibility fix.

### Task 16 — Complete accessibility and responsive evidence

**Objective:** Prove keyboard and assistive-technology-friendly behavior across representative
critical surfaces.

**Expected files:** Existing or focused accessibility E2E specs and documentation only.

**Tests/evidence first:** Run axe at representative pages and engines, then manually exercise
keyboard navigation, focus visibility, dialogs, headings, landmarks, validation, responsive
overflow, and reduced motion.

**Implementation changes:** Fix only reproducible accessibility defects, preserving server-side
authorization and route contracts.

**Migration implications:** None.

**Verification commands:**

~~~powershell
npx playwright test --grep accessibility
~~~

**Expected result:** No serious or critical axe violations and no blocked critical keyboard path at
375, 768, and 1280 px.

**Security/regression considerations:** Error and validation states must not expose raw backend
errors or credentials.

**Rollback/recovery:** Revert an isolated UI fix if it regresses workspace or approval behavior.

**Acceptance:** Accessibility evidence includes automated result and manual path notes.

**Commit-worthy:** Yes only for approved narrow UI fixes.

## Phase 9 — Security and isolation gate

### Task 17 — Execute the final security, authorization, isolation, and redaction checklist

**Objective:** Reconfirm all M1–M14 trust boundaries immediately before RC approval.

**Expected files:** Existing security tests, focused regression tests if needed, and external
checklist. No broad refactor.

**Tests/evidence first:** Run auth, workspace-isolation, RAG, workflow, webhook, approval,
integration, audit, observability-redaction, and health tests. Run a static scan for forbidden
capabilities.

**Implementation changes:** Only narrow fixes that directly address a failing release criterion.

**Migration implications:** None.

**Verification commands:**

~~~powershell
npm test -- --run tests/auth tests/workspace tests/rag tests/workflow tests/webhook tests/approval tests/integration tests/observability-redaction.test.ts
rg -n "child_process|exec\\(|spawn\\(|eval\\(|new Function|fetch\\(|axios|http://|https://" app lib worker scripts
~~~

**Expected result:** Better Auth, central authorization, workspace isolation, fixed Slack operation,
approval, redaction, no generic HTTP, and no forbidden runtime capabilities remain intact.

**Security/regression considerations:** Review static matches manually; do not treat the existence
of safe framework fetches or test fixtures as unrestricted application capability.

**Rollback/recovery:** Stop the release gate on any unresolved P0/P1 security result.

**Acceptance:** Checklist is signed with scope, evidence links, and any P2/P3 disposition.

**Commit-worthy:** Only if an approved narrow security fix is required.

## Phase 10 — Dedicated real Slack validation

### Task 18 — Run the controlled Slack integration test

**Objective:** Validate the existing secure Slack post_message path in a dedicated non-production
environment.

**Expected files:** tests/slack-real.integration.test.ts may be created only for the authorized
opt-in test. The token and app configuration remain outside the repository.

**Tests/evidence first:** Create or use a least-privilege Slack app, dedicated workspace and
channel, run one synthetic approved message through the normal vault and worker path, and verify
durable action, audit redaction, and Slack result.

**Implementation changes:** No connector feature changes. If a test-only harness is needed, it must
be opt-in through RUN_SLACK_INTEGRATION=1 and fail closed when credentials are absent.

**Migration implications:** None.

**Verification commands:**

~~~powershell
$env:RUN_SLACK_INTEGRATION = "1"
npm test -- --run tests/slack-real.integration.test.ts
Remove-Item Env:RUN_SLACK_INTEGRATION
~~~

**Expected result:** Exactly one synthetic post_message succeeds through the approved operation
policy and approval path; no credential appears in output or durable records.

**Security/regression considerations:** Do not print the token, use real customer data, broaden
scopes, or bypass approval. AMBIGUOUS remains terminal and non-retryable.

**Rollback/recovery:** Revoke or rotate the dedicated app credential, disable egress, and retain
only redacted evidence.

**Acceptance:** Slack evidence includes app scope, channel, operation, approval, action, audit,
redaction, revocation, and egress-disable confirmation.

**Commit-worthy:** Test-only commit only if separately authorized; external evidence alone is not
committed.

## Phase 11 — RC.1 evidence and approval

### Task 19 — Assemble and review the RC.1 evidence package

**Objective:** Decide whether all pre-RC gates are satisfied for one exact commit and digest.

**Expected files:** External evidence index and release decision record. No tag or release artifact
is created by this task.

**Tests/evidence first:** Cross-check every mandatory row in the design evidence table against a
timestamped result and environment.

**Implementation changes:** None. If evidence is missing, return to the owning task rather than
assuming pass.

**Migration implications:** Confirm clean and existing database evidence is attached.

**Verification commands:**

~~~powershell
git status --short --branch
git diff --check
docker compose -f docker-compose.production.yml config
~~~

**Expected result:** RC.1 is approved only with no P0/P1 findings, documented P2/P3 decisions,
immutable digest, model evidence, rollback path, and named approver.

**Security/regression considerations:** No evidence package contains secrets, raw logs, or
unredacted browser artifacts.

**Rollback/recovery:** Do not tag or deploy if any mandatory gate is incomplete.

**Acceptance:** A reviewer can reproduce the release decision from the evidence package.

**Commit-worthy:** No.

## Phase 12 — Controlled beta

### Task 20 — Operate the separate beta cohort

**Objective:** Observe the RC under real but controlled usage without adding features.

**Expected files:** External beta plan, invitations, monitoring, incident log, feedback summary,
and exit decision.

**Tests/evidence first:** Confirm separate environment, backup verification, incident contact,
rollback rehearsal, workspace invitations, monitoring, and support route.

**Implementation changes:** No feature changes during beta. A release blocker is fixed only through
a separately reviewed narrow change that repeats the affected gates.

**Migration implications:** No ad hoc schema changes during beta. A required schema change creates
a new release candidate and reruns migration evidence.

**Verification commands:** Record daily health, queue, error, backup, and incident checks for
7–14 days. Keep the cohort within 3–10 workspaces and 5–20 users unless separately approved.

**Expected result:** No unresolved P0/P1 defects, stable core operations, verified backups,
actionable feedback, and documented P2 disposition.

**Security/regression considerations:** Beta users remain workspace-isolated and receive no
unapproved connector, browser, or administrative capability.

**Rollback/recovery:** Redeploy the approved prior digest or disable beta admission using the
existing runbook; preserve incident evidence.

**Acceptance:** Named beta owner approves exit with monitoring and recovery evidence.

**Commit-worthy:** No.

## Phase 13 — Final v1.0 decision

### Task 21 — Prepare the final release decision without tagging or pushing

**Objective:** Confirm whether beta and all release gates support a later authorized v1.0 action.

**Expected files:** External final decision record. Package metadata changes are not authorized by
this plan unless the user separately approves them.

**Tests/evidence first:** Re-run the release-critical smoke, health, migration, backup verification,
security, redaction, Slack, and rollback checks against the final candidate digest.

**Implementation changes:** None. Do not create a tag, push, deploy, or start M16.

**Migration implications:** Confirm the candidate uses the reviewed migration set and no unreviewed
schema state.

**Verification commands:**

~~~powershell
npm run typecheck
npm run lint
npm test -- --run
npm run build
docker compose config
docker compose ps
.\scripts\verify-local.ps1
~~~

**Expected result:** Final decision explicitly states release approved, blocked, or deferred, with
every remaining P2/P3 item and operational owner.

**Security/regression considerations:** Production readiness is never inferred from a green local
suite when model provisioning, Slack, backup, supply chain, or deployment evidence is missing.

**Rollback/recovery:** Keep the prior approved digest and backup recovery path available until a
later authorized release action is complete.

**Acceptance:** A named approver can authorize a separate tag/push/release action from this record.

**Commit-worthy:** No for the validation plan itself; any later metadata or release commit requires
new explicit authorization.

## Evidence and reporting format

Every task report must include:

- task number and release gate;
- source commit and image digest;
- environment and database class;
- exact command or manual procedure;
- start and end timestamp;
- pass, fail, or blocked result;
- redacted output or external evidence reference;
- security and workspace-isolation observations;
- rollback or recovery action;
- reviewer and decision.

The release evidence store must not contain secrets, tokens, private keys, unredacted connection
strings, customer data, Playwright traces with credentials, or runtime artifacts intended for source
control.

## Plan self-review

This plan maps the approved M15 design to small, reviewable, test-first tasks. It explicitly covers
immutable artifacts, worker egress, Ollama provisioning and verified dimension, migrations, current
database safety, backup and restore, crash recovery, retry and idempotency invariants, bounded
performance, three browser engines, accessibility, security, redaction, real Slack, RC, beta, and
final v1.0 gates.

The plan does not authorize implementation, dependency installation, migration creation, database
reset, Docker-volume deletion, deployment, tagging, pushing, real Slack activity, or M16 work.

**Plan status:** Ready for explicit approval to begin validation implementation. This document
itself authorizes no implementation.
