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

`scripts/verify-local.ps1` also performs a live 768-dimensional finite-vector probe and runs the guarded Ollama/pgvector/RAG integration tests with `RUN_OLLAMA_INTEGRATION=1`. These checks require the existing Docker services and database migration to be available; they do not reset volumes.

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

## Automated verification

```powershell
.\scripts\verify-local.ps1
```

The script validates Compose, starts services, waits for app and dependency health, runs migrations, and executes TypeScript, lint, tests, and build checks. It never installs software automatically. If Docker is not installed, it exits with a clear prerequisite error.

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
