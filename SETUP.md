# Local setup

## Prerequisites

- Docker Desktop with Compose v2.
- Node.js 20.9 or newer.
- At least 8 GB of free disk space for local images and Ollama models.
- Enough memory for the selected Ollama model.

Docker is required for PostgreSQL, Redis, and Ollama. No paid API account is required.

## Configure the environment

From the Flowyn project root:

```powershell
Copy-Item .env.example .env.local
```

Use a unique `BETTER_AUTH_SECRET` with at least 32 characters. The default URLs are correct for a host Next.js process. The Compose app service overrides service-to-service URLs with Docker DNS names.

Important variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection for host commands | `postgres://flowyn:flowyn@localhost:5432/flowyn` |
| `REDIS_URL` | Redis connection for host commands | `redis://localhost:6379` |
| `OLLAMA_BASE_URL` | Ollama HTTP API | `http://localhost:11434` |
| `OLLAMA_MODEL` | Default local instruct model | `llama3.2:3b` |
| `OLLAMA_EMBEDDING_MODEL` | Local embedding model | `nomic-embed-text` |
| `OLLAMA_EMBEDDING_DIMENSION` | Verified vector dimension returned by the running model | `768` |
| `AI_PROVIDER` | Trusted provider selection | `ollama` |
| `AI_TEMPERATURE` | Default generation temperature | `0.4` |
| `AI_MAX_OUTPUT_TOKENS` | Default output token limit | `800` |
| `AI_REQUEST_TIMEOUT_MS` | Provider request timeout | `60000` |
| `MAX_GENERATION_PROMPT_CHARS` | Combined prompt character limit | `12000` |
| `KNOWLEDGE_CHUNK_SIZE` | Deterministic chunk size in characters | `1200` |
| `KNOWLEDGE_CHUNK_OVERLAP` | Deterministic chunk overlap in characters | `150` |
| `RAG_MAX_CONTEXT_CHARS` | Maximum retrieved context passed to the model | `8000` |
| `AGENT_MAX_STEPS_DEFAULT` | Default per-run agent step limit | `5` |
| `AGENT_MAX_STEPS_HARD_LIMIT` | Server hard ceiling for agent steps | `12` |
| `AGENT_TOTAL_TIMEOUT_MS` | Total synchronous agent run timeout | `120000` |
| `AGENT_TOOL_TIMEOUT_MS` | Per-tool execution timeout | `15000` |
| `AGENT_MAX_GOAL_CHARS` | Maximum run goal length | `4000` |
| `AGENT_MAX_OBSERVATION_CHARS` | Maximum tool observations carried into prompts | `6000` |
| `AGENT_MAX_FINAL_RESPONSE_CHARS` | Maximum persisted agent response length | `8000` |

Milestone 6 workflow limits are WORKFLOW_MAX_STEPS 20, WORKFLOW_TOTAL_TIMEOUT_MS 300000, WORKFLOW_STEP_TIMEOUT_MS 60000, WORKFLOW_MAX_RETRIES 2, WORKFLOW_MAX_INPUT_CHARS 12000, WORKFLOW_MAX_OUTPUT_CHARS 16000, WORKFLOW_MAX_CONTEXT_CHARS 24000, WORKFLOW_DISPATCH_LEASE_MS 30000, WORKFLOW_EXECUTION_LEASE_MS 90000, and WORKFLOW_WORKER_CONCURRENCY 1. These values bound inputs, context, attempts, execution time, leases, and worker concurrency.

Milestone 7 scheduling variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| SCHEDULER_POLL_INTERVAL_MS | Scheduler polling interval | 5000 |
| SCHEDULER_BATCH_SIZE | Maximum due schedules considered per poll | 25 |
| SCHEDULER_HEARTBEAT_TTL_SECONDS | Redis scheduler liveness TTL | 30 |
| SCHEDULE_MISFIRE_GRACE_SECONDS | Maximum bounded misfire age | 60 |
| SCHEDULE_MIN_INTERVAL_SECONDS | Minimum interval schedule period | 60 |
| SCHEDULE_MAX_INTERVAL_SECONDS | Maximum interval schedule period | 31536000 |

Milestone 8 webhook variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| WEBHOOK_SECRET_ENCRYPTION_KEY | Base64-encoded 32-byte AES-GCM key for webhook secrets | development-only local key |
| WEBHOOK_SECRET_KEY_VERSION | Version label for encrypted secret envelopes | `v1` |
| WEBHOOK_REPLAY_WINDOW_SECONDS | Accepted timestamp skew | `300` |
| WEBHOOK_MAX_BODY_BYTES | Maximum raw JSON request size | `262144` |
| WEBHOOK_RATE_LIMIT_GLOBAL_PER_MINUTE | Global public webhook admission limit | `600` |
| WEBHOOK_RATE_LIMIT_TRIGGER_PER_MINUTE | Per-trigger public webhook admission limit | `120` |
| WEBHOOK_EVENT_RETENTION_DAYS | Delivery metadata retention period | `30` |
| WEBHOOK_PUBLIC_BASE_URL | Trusted base URL displayed for webhook endpoints | `http://localhost:3000` |

Milestone 11 integration variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `INTEGRATION_EGRESS_ENABLED` | Enables the fixed Slack outbound transport | `false` |
| `INTEGRATION_CREDENTIAL_KEYRING_JSON` | Server-only JSON map of key versions to base64 32-byte keys | development-only local keyring |
| `INTEGRATION_CREDENTIAL_CURRENT_KEY_VERSION` | Key version used for newly encrypted integration credentials | `v1` |
| `INTEGRATION_REQUEST_TIMEOUT_MS` | Fixed-target request timeout | `10000` |
| `INTEGRATION_MAX_REQUEST_BYTES` | Maximum Slack request body size | `16384` |
| `INTEGRATION_MAX_RESPONSE_BYTES` | Maximum provider response size | `65536` |

Keep `INTEGRATION_EGRESS_ENABLED=false` for ordinary local development. Enabling it permits only the server-controlled Slack `post_message` connector; it does not enable arbitrary HTTP. Store non-development key material in an approved secret manager. Integration tokens are entered through the authenticated credential panel, encrypted immediately, and never shown again.

Generate a real deployment key with an approved secret manager or a cryptographically secure 32-byte random value encoded as base64. Never reuse the documented development key outside local development. Webhook secrets are shown only once when created or rotated.

## Start the local services

```powershell
docker compose up -d

docker compose ps
```

PostgreSQL uses the pgvector-capable `pgvector/pgvector:pg16` image. PostgreSQL, Redis, and Ollama use named volumes so restarts do not remove data or downloaded models.

Pull the recommended local models once:

```powershell
docker compose exec ollama ollama pull llama3.2:3b
docker compose exec ollama ollama pull nomic-embed-text
```

Ollama does not download models automatically during a health check. This makes setup failures visible and avoids surprising multi-gigabyte downloads.

## Install and migrate

```powershell
npm install
docker compose exec app npm run db:migrate
```

To seed the explicit development demo data:

```powershell
docker compose exec app npm run db:seed
```

The seed command is idempotent and creates a Demo Workspace plus an Acme AI brand. It is not used to answer user AI prompts.

## Start Next.js

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Create an account at `/sign-up`, create a workspace and brand in `/dashboard`, then try the local AI panel.

Workspace membership, brand mutations, and AI generation are authorized server-side using the authenticated session and the member's workspace role. AI generation requires a workspace ID and can optionally include a brand ID from that same workspace.

Brand knowledge is manual text scoped to a brand. Creating or re-indexing a document validates and chunks its content, calls `nomic-embed-text`, validates the live configured dimension, and replaces its chunks transactionally. RAG is opt-in through `useBrandContext: true` and retrieved text is delimited as untrusted data.

The dashboard Agents panel manages workspace-owned definitions and lets members run enabled agents synchronously. Definitions may be optionally bound to a brand; the server validates that relationship and removes brand-dependent tools when no trusted brand is available. DELETE is a soft delete so run history remains readable. The run body accepts only `goal`; the server supplies workspace, user, agent, brand, tool, policy, and cancellation context. GET `/api/agent-runs/:id` returns only bounded run fields and safe step summaries.

scripts/verify-local.ps1 performs a live finite-vector probe, uses that verified dimension when checking PostgreSQL, and runs the guarded Ollama/pgvector/RAG/agent/workflow/scheduling/integration tests. These checks require the existing Docker services and database migration to be available; they do not reset volumes. Real Slack tests are opt-in only and require `RUN_SLACK_INTEGRATION=1`, `INTEGRATION_TEST_SLACK_TOKEN`, and `INTEGRATION_TEST_SLACK_CHANNEL`.

The dashboard Workflows panel accepts a strict JSON definition and creates immutable versions. Runs are queued through a PostgreSQL outbox and BullMQ, then executed by the worker. Supported steps are SET_VALUE, TRANSFORM, CONDITION, AI_GENERATE, AGENT, APPROVAL, and INTEGRATION_ACTION. APPROVAL requires `requiredRole` OWNER or ADMIN and may specify `expiresAfterSeconds` from 60 through 31,536,000 seconds; an absent value waits indefinitely. The worker releases its lease while waiting. Approval resumes the same immutable snapshot through a generation-aware outbox continuation; rejection, expiration, and waiting cancellation are terminal. An integration action is valid only when every reachable path crosses an approval-required APPROVAL step and its credential ID belongs to the workflow workspace.

The dashboard Workflow schedules panel creates CRON, INTERVAL, and ONE_TIME schedules for existing workflows. Schedule state and occurrence history are stored in PostgreSQL; the scheduler service polls due rows, creates the existing durable workflow run/outbox records, and the worker executes them. Check the scheduler with docker compose exec scheduler npm run scheduler:health. Members can view schedules and history; admins and owners can mutate them.

The dashboard Secure workflow webhooks panel creates workspace-owned triggers for existing workflows. Public requests must include `X-Flowyn-Timestamp` and `X-Flowyn-Signature: v1=<hex>`, where the HMAC-SHA256 message is `<timestamp>.<exact raw body bytes>`. A signed request is durably deduplicated in PostgreSQL before the existing outbox/worker path runs. Event history stores hashes, sizes, status, duplicate counts, and run links only; it does not store raw bodies, headers, signatures, or secrets. Members can read safe history; admins and owners can mutate triggers.

The dashboard Workflows panel also provides a Canvas editor for existing workflows. The canvas and Advanced JSON views edit the same seven-step `WorkflowDefinition`; the Slack action uses a static connector/operation and safe credential metadata selector, while node coordinates and viewport are stored separately in `workflow_editor_layouts`. Save requests include the loaded `currentVersionId`, and a concurrent save returns HTTP 409 `WORKFLOW_VERSION_CONFLICT` without discarding unsaved edits. Agent, brand, and integration credential references are rechecked server-side even when a workflow is disabled.

## Health checks

```powershell
Invoke-RestMethod http://localhost:3000/api/health
Invoke-RestMethod http://localhost:3000/api/health/postgres
Invoke-RestMethod http://localhost:3000/api/health/redis
Invoke-RestMethod http://localhost:3000/api/health/ollama
Invoke-RestMethod http://localhost:3000/api/ai/health
Invoke-RestMethod http://localhost:11434/api/tags
```

`/api/health/ollama` reports `MODEL_MISSING` until the configured model has been pulled. `/api/ai/health` uses the same readiness rule.

The worker is independently startable and health is based on a Redis heartbeat rather than process existence:

docker compose ps worker
docker compose exec worker npm run worker:health

The scheduler is independently startable and has the same heartbeat model:

docker compose ps scheduler
docker compose exec scheduler npm run scheduler:health

## Automated verification

```powershell
.\scripts\verify-local.ps1
```

The script validates Compose, starts services, waits for app and dependency health, runs migrations, and executes TypeScript, lint, tests, and build checks. It never installs software automatically. If Docker is not installed, it exits with a clear prerequisite error.

The full local verification script also checks workflow tables, constraints, leases, outbox fields, worker heartbeat, clean migrations, BullMQ execution, immutable snapshots, and workflow/Ollama integration. It never resets databases or deletes Docker volumes.
It additionally checks schedule tables, occurrence uniqueness, scheduler heartbeat, bounded one-time execution, and schedule-to-worker delivery.
It also checks webhook tables, encrypted-secret projections, protocol bounds, public route deduplication, and the existing workflow outbox path without exposing credentials or raw delivery bodies.
It also checks approval tables, role/status/expiry constraints, safe projections, manual/scheduled/webhook pause and resume, rejection, expiration, cancellation, role enforcement, decision races, idempotency, and continuation generation without rerunning completed steps.
It also checks the visual-editor layout table/indexes, definition projection, version-scoped layout persistence, and concurrent first-writer-wins saves in `tests/workflow-editor.integration.test.ts`.
It also checks integration credential/action tables and constraints, purpose-bound secret encryption, fixed Slack registry/egress behavior, approval coverage, safe credential projections, duplicate action recovery, ambiguous outcome handling, and integration API authorization. A real Slack provider call is never part of the default verification run.

## Troubleshooting

### Docker command is not found

Install Docker Desktop, restart PowerShell, and confirm:

```powershell
docker --version
docker compose version
```

### Ollama is reachable but the model is missing

Run the model pull commands above and confirm the exact tag matches `OLLAMA_MODEL` in `.env.local`.

### PostgreSQL migration cannot connect

Confirm the container is healthy:

```powershell
docker compose ps postgres
docker compose logs postgres
```

The host URL uses `localhost`; the app container uses the service name `postgres`.

### Rebuild after dependency changes

```powershell
docker compose up -d --build
```
