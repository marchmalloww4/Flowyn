# Flowyn M15 Controlled Beta Evidence Template

**Status:** Preparation template only. Blank fields and unchecked boxes are not passes.

This packet supports the controlled beta and final v1.0 decision for the exact RC artifact. It
does not replace the [M15 design](../superpowers/specs/2026-08-15-milestone-15-release-candidate-validation-design.md)
or [M15 validation plan](../superpowers/plans/2026-08-15-milestone-15-release-candidate-validation-plan.md).
The authoritative evidence record belongs in the approved external evidence store; this repository
file contains only a reusable, secret-free operator template.

## Evidence hygiene

- Use synthetic data or explicitly consented beta data only.
- Use pseudonymous workspace and user identifiers in this record.
- Never record tokens, passwords, private keys, connection strings, authorization headers, raw
  prompts, raw provider responses, unredacted logs, customer data, screenshots containing secrets,
  or Playwright traces with credentials.
- Reference external evidence by a redacted identifier, checksum, or controlled link.
- A skipped, unavailable, or manually asserted result is `BLOCKED`, not `PASS`.
- Record the source commit, artifact digest, environment class, command or procedure, timestamps,
  operator, result, and reviewer for every gate.

## 1. Record metadata

| Field | Value |
| --- | --- |
| Evidence package ID |  |
| Beta environment ID |  |
| RC tag | `v1.0.0-rc.1` |
| RC commit SHA |  |
| Artifact image reference |  |
| Artifact image digest |  |
| Beta owner |  |
| Incident contact |  |
| Start timestamp (UTC) |  |
| Planned observation period | `7–14 days` |
| Actual end timestamp (UTC) |  |
| Reviewer |  |

## 2. RC and beta-entry gate

- [ ] `master` is the approved branch and the working tree is clean.
- [ ] `v1.0.0-rc.1` points to the recorded RC commit.
- [ ] No source, schema, migration, dependency, or integration code changed after qualification.
- [ ] No `v1.0.0` tag exists.
- [ ] RC image digest, SBOM, provenance, scan, and source commit agree.
- [ ] A rollback target and recovery procedure are recorded.
- [ ] A named beta owner and incident contact are assigned.
- [ ] Beta users have explicitly approved invitations and data handling.

**Entry decision:** `OPEN / BLOCKED / READY FOR HUMAN APPROVAL`

**Evidence references:**

| Gate | Command/procedure | Start UTC | End UTC | Result | Evidence reference | Reviewer |
| --- | --- | --- | --- | --- | --- | --- |
| Source baseline |  |  |  |  |  |  |
| Artifact identity |  |  |  |  |  |  |
| Rollback readiness |  |  |  |  |  |  |
| Beta approval |  |  |  |  |  |  |

## 3. Beta environment readiness

The beta environment must be separate from development and production. Do not reuse development
secrets, databases, Redis data, Ollama volumes, or keyrings.

| Component | Required condition | Result | Evidence reference |
| --- | --- | --- | --- |
| PostgreSQL | Separate beta instance/database, private network, durable backup policy |  |  |
| Redis | Separate beta instance/data, private network, ephemeral role understood |  |  |
| Ollama | Separate persistent volume with required models |  |  |
| Keyrings | Separate Better Auth, webhook, integration, and AI-idempotency key material |  |  |
| Artifact | App, worker, scheduler, and migrator use the same immutable digest |  |  |
| Network | PostgreSQL, Redis, and Ollama have no public exposure |  |  |
| Ingress | Approved HTTPS edge/reverse proxy is configured where applicable |  |  |
| Migrator | Completes once with advisory lock and expected journal |  |  |
| App | Liveness and core readiness are healthy |  |  |
| Worker | Heartbeat is healthy and egress path is restricted |  |  |
| Scheduler | Heartbeat is healthy and PostgreSQL-authoritative |  |  |
| Slack egress | Dedicated test app/channel only; disabled by default |  |  |
| Generation model | `llama3.2:3b` is provisioned and restart-persistent |  |  |
| Embedding model | `nomic-embed-text` is provisioned and restart-persistent |  |  |
| Embedding dimension | Expected `768`; actual measured value recorded |  |  |

Use the existing [deployment runbook](deployment.md), not a new deployment architecture. Keep
production environment files and all secret values outside this repository.

## 4. Cohort and observation period

| Requirement | Planned value | Actual value | Evidence reference |
| --- | --- | --- | --- |
| Workspaces | `3–10` |  |  |
| Explicitly approved users | `5–20` |  |  |
| Consent/invitation record |  |  |  |
| Start date/time UTC |  |  |  |
| End date/time UTC |  |  |  |
| Observation duration | `7–14 days` or approved exit condition |  |  |

If the cohort or environment does not exist, record:

`BETA COHORT: NOT YET AVAILABLE`

`BETA EXECUTION: NOT YET PERFORMED`

Do not compress elapsed-time observation into a single automated run.

## 5. Daily operations checklist

Create one row per check per day. Attach only redacted evidence.

| Date/time UTC | Check | Result | Measurement or safe summary | Incident/defect ID | Evidence reference | Operator |
| --- | --- | --- | --- | --- | --- | --- |
|  | App liveness/readiness |  |  |  |  |  |
|  | PostgreSQL health and pool behavior |  |  |  |  |  |
|  | Redis health and latency |  |  |  |  |  |
|  | Ollama health/model readiness |  |  |  |  |  |
|  | Worker heartbeat and failures |  |  |  |  |  |
|  | Scheduler heartbeat and failures |  |  |  |  |  |
|  | Queue depth and outbox backlog |  |  |  |  |  |
|  | Workflow failures/retries |  |  |  |  |  |
|  | Approval failures/expiry |  |  |  |  |  |
|  | Webhook failures/replays |  |  |  |  |  |
|  | Slack action outcomes |  |  |  |  |  |
|  | AI/provider failures and timeouts |  |  |  |  |  |
|  | Quota/concurrency pressure |  |  |  |  |  |
|  | CPU, memory, disk pressure |  |  |  |  |  |
|  | Backup completion and age |  |  |  |  |  |
|  | Incident review |  |  |  |  |  |
|  | Defect review and trend |  |  |  |  |  |

## 6. Critical journey evidence

Use synthetic or consented identities. Do not record email addresses, tokens, raw prompts, or
provider payloads.

| # | Journey | Date/time UTC | Workspace/user pseudonyms | Result | Failure details | Severity | Reproducible | Remediation | Evidence reference |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Sign-up |  |  |  |  |  |  |  |  |
| 2 | Sign-in |  |  |  |  |  |  |  |  |
| 3 | Sign-out |  |  |  |  |  |  |  |  |
| 4 | Workspace creation |  |  |  |  |  |  |  |  |
| 5 | Workspace switching |  |  |  |  |  |  |  |  |
| 6 | Membership and roles |  |  |  |  |  |  |  |  |
| 7 | Brand creation/editing |  |  |  |  |  |  |  |  |
| 8 | Knowledge creation/indexing |  |  |  |  |  |  |  |  |
| 9 | RAG retrieval |  |  |  |  |  |  |  |  |
| 10 | AI generation |  |  |  |  |  |  |  |  |
| 11 | Agent creation/run |  |  |  |  |  |  |  |  |
| 12 | Visual workflow creation |  |  |  |  |  |  |  |  |
| 13 | Workflow execution |  |  |  |  |  |  |  |  |
| 14 | Workflow retry/recovery |  |  |  |  |  |  |  |  |
| 15 | Schedule creation/execution |  |  |  |  |  |  |  |  |
| 16 | Webhook trigger |  |  |  |  |  |  |  |  |
| 17 | Human approval decision |  |  |  |  |  |  |  |  |
| 18 | Slack credential lifecycle |  |  |  |  |  |  |  |  |
| 19 | Approved Slack `post_message` |  |  |  |  |  |  |  |  |
| 20 | Usage and operations |  |  |  |  |  |  |  |  |
| 21 | Settings |  |  |  |  |  |  |  |  |
| 22 | Backup/restore procedure |  |  |  |  |  |  |  |  |
| 23 | Session expiration |  |  |  |  |  |  |  |  |
| 24 | Cross-workspace isolation |  |  |  |  |  |  |  |  |

## 7. Defect record and disposition

Severity definitions:

- **P0:** catastrophic security, data-loss, or availability impact; blocks all use.
- **P1:** release blocker; blocks final v1.0.
- **P2:** significant but deferrable with owner, mitigation, and review/expiry dates.
- **P3:** minor or cosmetic with an explicit rationale.

### Defect record

| Field | Value |
| --- | --- |
| Defect ID |  |
| Date/time UTC |  |
| Environment |  |
| Affected version/digest |  |
| Description |  |
| Reproduction steps |  |
| Expected result |  |
| Actual result |  |
| Severity | `P0 / P1 / P2 / P3` |
| Security/data impact |  |
| Fix status |  |
| Regression evidence |  |
| Release disposition |  |
| Reviewer |  |

Any P0/P1 remains open until fixed, regression-tested, and requalified. A material RC change
requires a new release candidate decision; do not silently reuse old evidence.

## 8. Backup and restore evidence

Follow [backup and restore](backup-restore.md). Use an external backup store and an isolated
restore target. Never use a live beta database as the restore target.

| Check | Required evidence | Result | Evidence reference |
| --- | --- | --- | --- |
| Daily backup | Backup identifier, timestamp, age, checksum |  |  |
| External storage | Storage policy and retention reference |  |  |
| Encryption | Backup encryption confirmation |  |  |
| Key custody | External keyring/key-custody reference |  |  |
| Isolated restore | Disposable target and restore transcript |  |  |
| Migration journal | Expected migrations and schema invariants |  |  |
| Durable state | Workspace, workflow, approval, webhook, integration, audit, usage checks |  |  |
| Encrypted material | Decryption with the correct beta keyrings |  |  |
| Missing-key behavior | Explicit safe failure using an isolated test |  |  |
| Restore elapsed time | Measured start/end timestamps |  |  |

| Target | Required | Actual | Result |
| --- | --- | --- | --- |
| RPO | `24 hours` |  |  |
| RTO | `2 hours` |  |  |

Do not claim PITR or WAL recovery unless it is actually configured and demonstrated.

## 9. Performance evidence

### Bounded non-AI profile

| Field | Value |
| --- | --- |
| Environment/artifact digest |  |
| Seed data description |  |
| Concurrent users | `20` target |
| Request rate | Approximately `5 RPS` |
| Duration | Approximately `10 minutes` |
| Request count |  |
| Success count |  |
| Error count/rate |  |
| p50 |  |
| p95 |  |
| p99 |  |
| Workflow acknowledgement latency |  |
| Queue depth/backlog |  |
| Outbox backlog |  |
| PostgreSQL utilization |  |
| Redis utilization |  |
| CPU |  |
| Memory |  |
| Recovery time after load |  |
| Evidence reference |  |

### Ollama characterization

Record model, hardware, input size, concurrency, generation latency, embedding latency, timeout
behavior, memory, throughput, and restart behavior separately. Do not convert hardware-specific
measurements into universal AI SLAs.

## 10. Browser and accessibility evidence

| Browser/engine | Version | Viewport | Tests | Passed | Failed | Skipped | Serious/critical axe findings | Evidence reference |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| Chromium |  | 375px |  |  |  |  |  |  |
| Chromium |  | 768px |  |  |  |  |  |  |
| Chromium |  | 1280px |  |  |  |  |  |  |
| Firefox |  | 375px/1280px |  |  |  |  |  |  |
| WebKit |  | 375px/1280px |  |  |  |  |  |  |
| Keyboard smoke |  | All required surfaces |  |  |  |  |  |  |

The gate requires no serious/critical axe violations, no critical journey failures, and no
release-blocking responsive or keyboard regression. Keep screenshots and traces outside source
control and redact any external evidence.

## 11. Security review

- [ ] Better Auth remains authoritative, with production secure-cookie and trusted-origin checks.
- [ ] OWNER/ADMIN/MEMBER authorization is server-side and workspace-scoped.
- [ ] Populated cross-workspace isolation checks pass.
- [ ] Integration, webhook, and AI-idempotency keyrings are separate and recoverable.
- [ ] No credentials appear in prompts, snapshots, queues, logs, audit metadata, outputs, or browser responses.
- [ ] Inbound webhook HMAC, replay protection, bounds, and rate limits pass.
- [ ] Slack remains the only fixed outbound operation: `chat.postMessage`.
- [ ] Worker-only egress and platform destination allowlisting are verified.
- [ ] `INTEGRATION_EGRESS_ENABLED=false` is the default and is reset after dedicated testing.
- [ ] Approval is mandatory for integration actions.
- [ ] `AMBIGUOUS` external outcomes remain terminal and non-retryable.
- [ ] AgentRunner has no integration tools.
- [ ] No generic HTTP, OAuth, shell, arbitrary SQL, filesystem, eval, dynamic module, or runtime browser capability exists.
- [ ] PostgreSQL, Redis, and Ollama remain private.
- [ ] Raw operational errors are redacted from users and logs.
- [ ] Readiness distinguishes core service readiness from AI-required readiness.

**Security reviewer:**
**Review timestamp UTC:**
**Evidence reference:**
**Result:** `OPEN / BLOCKED / PASS`

## 12. Dependency P2 disposition

Current baseline must be recorded as:

```text
CRITICAL: 0
HIGH: 0
MODERATE: 4
LOW: 0
```

Do not run automatic audit fixes. Each moderate finding requires a completed disposition before
final release.

| Finding ID | Advisory/package path | Production reachability | Mitigation | Owner | Review date | Expiry date | Deferral reason | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M15-P2-01 |  |  |  |  |  |  |  |  |
| M15-P2-02 |  |  |  |  |  |  |  |  |
| M15-P2-03 |  |  |  |  |  |  |  |  |
| M15-P2-04 |  |  |  |  |  |  |  |  |

## 13. Immutable artifact evidence

| Field | Value/evidence reference |
| --- | --- |
| Source commit SHA |  |
| Git tag | `v1.0.0-rc.1` |
| Image reference/tag |  |
| Image digest |  |
| SBOM reference/checksum |  |
| Provenance reference |  |
| Container scan reference/result |  |
| Node version | `22.23.1` baseline |
| Next.js version | `16.3.1` baseline |
| App image identity |  |
| Worker image identity |  |
| Scheduler image identity |  |
| Migrator image identity |  |

Verify that all four Flowyn runtime roles use the same intended immutable image. A local rebuild
or mutable `latest` image is not proof that the deployed beta uses the RC artifact.

## 14. Slack beta validation

Carry forward the qualified full-path Slack result only while all integration-related code remains
unchanged after qualification.

- [ ] Dedicated non-production Slack app and workspace confirmed.
- [ ] Dedicated test channel confirmed.
- [ ] Least-privilege credential is held outside the repository.
- [ ] Normal encrypted credential vault path used.
- [ ] Authorized human approval recorded.
- [ ] Exactly one synthetic `post_message` delivered.
- [ ] Exactly one durable integration action reached `SUCCEEDED`.
- [ ] Idempotent replay did not duplicate delivery.
- [ ] Audit, logs, queues, snapshots, outputs, and browser responses contain no token.
- [ ] `AMBIGUOUS` remains terminal/non-retryable.
- [ ] Test credential revoked or rotated after the run.
- [ ] Egress disabled after cleanup.

Never place the Slack token, channel secret, customer data, or raw provider response in evidence.
If integration, workflow, approval, credential, worker/outbox, authorization, or egress code
changes, rerun the full-path qualification before final v1.0 review.

## 15. Incident and recovery drills

Use the existing [incident response](incident-response.md) and [rollback](rollback.md) runbooks.
Record actual response time and outcome; do not mark a drill complete from documentation alone.

| Drill | Failure injected/procedure | Start UTC | End UTC | Response time | Result | Final invariant | Evidence reference |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PostgreSQL outage |  |  |  |  |  |  |  |
| Redis outage |  |  |  |  |  |  |  |
| Ollama outage |  |  |  |  |  |  |  |
| Worker outage |  |  |  |  |  |  |  |
| Scheduler outage |  |  |  |  |  |  |  |
| Failed migration |  |  |  |  |  |  |  |
| Failed backup |  |  |  |  |  |  |  |
| Isolated restore |  |  |  |  |  |  |  |
| Credential/key issue |  |  |  |  |  |  |  |
| Slack `AMBIGUOUS` action |  |  |  |  |  |  |  |
| Readiness failure |  |  |  |  |  |  |  |

## 16. Beta exit criteria

- [ ] Required 7–14 day observation period genuinely completed.
- [ ] No unresolved P0 defects.
- [ ] No unresolved P1 defects.
- [ ] Critical journeys are complete with evidence.
- [ ] Daily backups succeeded and retention is verified.
- [ ] Isolated restore drill succeeded.
- [ ] RPO/RTO measurements meet the approved targets or have explicit disposition.
- [ ] Bounded performance profile completed and reviewed.
- [ ] Ollama performance/readiness evidence is recorded separately.
- [ ] Chromium, Firefox, WebKit, responsive, keyboard, and axe gates passed.
- [ ] Slack release evidence remains valid and credential cleanup is complete.
- [ ] Security review is signed.
- [ ] All four moderate dependency findings have explicit P2 dispositions.
- [ ] Operators can deploy, rollback, and recover using the approved runbooks.
- [ ] Defect trend and beta feedback are reviewed.
- [ ] Final human release approval is recorded.

**Beta exit decision:** `NOT READY / BLOCKED / READY FOR HUMAN APPROVAL / APPROVED`

**Open P2/P3 items and owners:**

| ID | Description | Owner | Mitigation | Review/expiry | Release decision |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

## 17. Final v1.0 decision record

This record must be completed by a human approver after beta exit. Do not create `v1.0.0`
automatically.

| Criterion | Result | Evidence reference |
| --- | --- | --- |
| RC.1 qualification |  |  |
| Controlled beta exit |  |  |
| P0/P1 status |  |  |
| P2/P3 disposition |  |  |
| Backup/restore and RPO/RTO |  |  |
| Deployment/recovery |  |  |
| Browser/accessibility |  |  |
| Security |  |  |
| Dependencies/supply chain |  |  |
| Slack evidence |  |  |
| Ollama/model/embedding |  |  |
| Operator readiness |  |  |

**Final decision:** `BLOCKED / DEFERRED / READY FOR HUMAN APPROVAL / APPROVED`

**Approver:**
**Approval timestamp UTC:**
**Rollback reference:**
**Notes:**

M15 is the final milestone. No further milestone is created by this template.
