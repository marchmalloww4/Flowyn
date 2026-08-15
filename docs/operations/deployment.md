# Production deployment

This is a controlled single-host/private-staging procedure, not a high-availability design.

Prerequisites: Docker Compose v2, a reviewed image/build commit, PostgreSQL and Redis backup access, the three server keyrings, an HTTPS edge proxy, and an external production environment file. Never place secrets in this repository.

Validate and build:

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml config
docker compose --env-file .env.production -f docker-compose.production.yml build
docker compose --env-file .env.production -f docker-compose.production.yml up migrator
```

Start the private services:

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml up -d app worker scheduler postgres redis ollama
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

Expected: only the app/edge path has a host binding; the app joins the private service network plus a dedicated ingress network, while PostgreSQL, Redis, and Ollama remain private-only. The migrator exits successfully; app readiness is `ready` or `degraded` only when Ollama is unavailable; worker and scheduler report live per-instance heartbeats.

Stop before rollout if configuration, migration, networking, or heartbeat checks fail. Do not run `db:push`, reset a database, or remove volumes. Verify liveness, readiness, worker/scheduler health, migration journal state, queue drain, and one safe authenticated workspace operation after rollout.
