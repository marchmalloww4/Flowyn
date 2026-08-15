# Flowyn — Supervisor Demonstration Guide

This guide is a 10–15 minute demonstration of the qualified application
candidate `v1.0.0-rc.1`. It uses local Docker services and synthetic data. It
does not require real Slack credentials and must not enable real Slack egress
for a normal supervisor demonstration.

## Before the demonstration

Run the local setup from [SETUP.md](../SETUP.md), including Docker Compose,
database migrations, and the two documented Ollama models. Confirm:

```powershell
docker compose ps
Invoke-RestMethod http://localhost:3000/api/health/ready
```

Keep `INTEGRATION_EGRESS_ENABLED=false`. If the application is already running,
open [http://localhost:3000](http://localhost:3000). Use a fresh synthetic
account or the explicitly seeded development demo data. Do not use customer
data or paste a Slack token into the browser.

## Demonstration flow

### 1. Introduce Flowyn — 45 seconds

**What to click/run:** Open the application landing page and state that Flowyn
is a workspace-based automation platform combining local AI, brand knowledge,
controlled agents, durable workflows, approvals, and one secure external action.

**What to observe:** The product boundary is visible before any data is entered.

**Why it matters:** The project solves the gap between disconnected AI,
knowledge, approval, and automation tools while keeping the trust model narrow.

### 2. Sign in — 45 seconds

**What to click/run:** Choose **Sign up** or **Sign in** and use a synthetic
development account.

**What to observe:** Better Auth creates or restores the authenticated session;
protected dashboard content is not available to an anonymous browser.

**Why it matters:** Authentication is established centrally before workspace
data or operations can be accessed.

### 3. Show the workspace — 45 seconds

**What to click/run:** Open the dashboard workspace switcher. If needed, create
a synthetic workspace and select it.

**What to observe:** The selected workspace is shown in the shell and its
management panels are scoped to that workspace.

**Why it matters:** Workspace context is the tenant boundary used by every
server-side authorization check.

### 4. Show the brand — 45 seconds

**What to click/run:** Open **Brands**, inspect the synthetic brand profile, and
show its voice/rules/examples if present.

**What to observe:** Brand data is managed inside the selected workspace.

**Why it matters:** Brand context gives AI and agents controlled business
context without making the browser or model an authorization authority.

### 5. Add or inspect knowledge/RAG — 60 seconds

**What to click/run:** Open **Knowledge**, add a short synthetic brand note such
as a fictional tone guide, then index it if the local model is ready. Retrieve
or inspect the resulting document/chunk status.

**What to observe:** The document is associated with the selected brand and
embeddings are generated through `nomic-embed-text`; the configured live
dimension is 768.

**Why it matters:** Flowyn demonstrates bounded semantic retrieval with
workspace/brand isolation rather than unrestricted model context.

### 6. Demonstrate AI generation — 60 seconds

**What to click/run:** Open **AI**, select the synthetic workspace and brand,
and request a short output using the local model.

**What to observe:** The request is validated, the provider is Ollama through
`LLMProvider`, and the result is bounded and presented in the workspace UI.

**Why it matters:** The provider abstraction keeps domain code independent of a
single AI vendor while local Ollama keeps the demonstration self-contained.

### 7. Show AgentRunner — 60 seconds

**What to click/run:** Open **Agents**, inspect an enabled synthetic agent and
run a small goal that uses only available safe brand/knowledge tools.

**What to observe:** The run shows bounded steps and safe output; no integration
tool, shell, arbitrary HTTP, filesystem, or dynamic-code tool is available.

**Why it matters:** Agent autonomy is controlled by a static registry, explicit
limits, trusted server context, and a bounded runner.

### 8. Open the visual workflow editor — 75 seconds

**What to click/run:** Open **Workflows**, select an existing synthetic workflow
or create one, then switch between **Canvas** and **Advanced JSON**.

**What to observe:** The same server-validated definition is represented in both
views. Add or inspect simple `SET_VALUE`, `TRANSFORM`, or `CONDITION` steps and
save.

**Why it matters:** The editor improves usability without moving validation or
authorization into the browser; stale saves are rejected by version token.

### 9. Explain durable workflow execution — 60 seconds

**What to click/run:** Start a synthetic workflow run and open its run detail.
Optionally show the **Operations** page or run:

```powershell
docker compose ps worker scheduler
docker compose exec worker npm run worker:health
docker compose exec scheduler npm run scheduler:health
```

**What to observe:** The run progresses through PostgreSQL-authoritative state,
the outbox, BullMQ, and the worker; the scheduler is a separate process.

**Why it matters:** A worker restart or duplicate queue delivery does not create
a second workflow engine or make Redis the durable source of truth.

### 10. Show scheduling — 45 seconds

**What to click/run:** Open **Schedules** and inspect a synthetic CRON, interval,
or one-time schedule. Do not create a high-frequency schedule for the demo.

**What to observe:** Schedule state and occurrence history are visible, while
the scheduler heartbeat is independently reported.

**Why it matters:** Scheduling is PostgreSQL-authoritative and feeds the same
durable workflow path as other triggers.

### 11. Show the approval gate — 60 seconds

**What to click/run:** Open **Approvals**, inspect a pending synthetic approval,
and approve it with a synthetic account that has the required `OWNER` or `ADMIN`
role. If no approval example exists, show the configured `APPROVAL` step in the
workflow editor and explain the inbox path without creating an external action.

**What to observe:** The approval policy, requester, bounded context, and
decision state are visible; a member or automation principal cannot decide it.

**Why it matters:** Human approval is a durable security boundary before an
externally affecting integration operation.

### 12. Show Slack integration architecture safely — 60 seconds

**What to click/run:** Open **Integrations** and show the safe catalog and
credential metadata panel. Do not enter a real token and do not enable egress.
Then show the workflow's fixed Slack action configuration if one is present.

**What to observe:** The only operation is Slack `post_message`; credentials are
represented by safe metadata/IDs, not secret values. The UI does not offer a
generic URL or arbitrary connector field.

**Why it matters:** The platform demonstrates a reviewable integration boundary
instead of exposing a general-purpose network client.

### 13. Show usage, operations, and security controls — 60 seconds

**What to click/run:** Open **Operations** and **Settings**, and inspect usage,
health, readiness, limits, and safe operational summaries. Mention that the
server enforces workspace roles and that `INTEGRATION_EGRESS_ENABLED` defaults
to false.

**What to observe:** Projections contain safe operational metadata rather than
prompts, model responses, webhook bodies, credentials, or queue payloads.

**Why it matters:** Quotas, concurrency, readiness, redaction, and auditability
make the system operable rather than merely functional.

### 14. Show validation evidence — 45 seconds

**What to click/run:** Show the repository's verification commands and the
corresponding documentation:

```powershell
npm run typecheck
npm run lint
npm test -- --run
npm run build
.\scripts\verify-local.ps1
```

Also point to the browser, migration, backup/restore, security, and Slack
qualification runbooks under `docs/operations/`.

**What to observe:** The project has evidence for code quality, runtime health,
browser/accessibility behavior, recovery, isolation, and the dedicated Slack
path.

**Why it matters:** The release candidate is supported by repeatable evidence,
not only a visual walkthrough.

### 15. Conclude — 30 seconds

**What to click/run:** Return to the dashboard overview and state the release
status: `v1.0.0-rc.1` is technically qualified for supervisor evaluation;
controlled beta and final production release approval remain separate gates.

**What to observe:** The demonstration ends with a truthful release statement,
not an implied production-deployment claim.

**Why it matters:** The project distinguishes implementation completion from
operational evidence that has not yet been collected.

## Ollama fallback plan

If Ollama inference is slow or temporarily unavailable:

1. Do not weaken readiness checks or change production configuration.
2. Show the health/readiness response and explain that core operations can be
   available in degraded-AI mode while AI-required operations wait for model
   provisioning.
3. Continue with authentication, workspace, brand, knowledge metadata,
   workflow editor, approval, integrations metadata, operations, and the test
   evidence sections.
4. Use the recorded 768-dimensional embedding and technical qualification
   evidence only as historical evidence; do not present a skipped live inference
   as a new pass.

## Safe Slack note

The normal supervisor demonstration must not perform Slack egress. The separate
M15 full-path qualification used dedicated non-production credentials and the
existing vault, approval, outbox, worker, durable-action, redaction, and
idempotency paths. Only redacted evidence should be shown. Never display or
record the test token, provider response, authorization header, or channel
secret.
