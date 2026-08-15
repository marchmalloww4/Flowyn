# Production deployment

This is a controlled single-host/private-staging procedure, not a high-availability design.

Prerequisites: Docker Compose v2, a reviewed immutable image digest, PostgreSQL and Redis backup access, the three server keyrings, an HTTPS edge proxy, a pre-created worker egress network with a platform-level allowlist for `https://slack.com/api/chat.postMessage`, and an external production environment file. Never place secrets in this repository.

The production Compose file does not create a general-purpose outbound network. Create the externally managed egress network according to the host or platform firewall procedure, allow only the Slack API destination required by the fixed `slack.chat.post_message` connector, and set `FLOWYN_WORKER_EGRESS_NETWORK` to that network name. Only the worker is attached to this network; PostgreSQL, Redis, Ollama, the migrator, scheduler, and app remain on the internal private network (the app also uses ingress). Keep `INTEGRATION_EGRESS_ENABLED=false` unless a dedicated, non-production Slack validation environment has approved credentials and an explicit change window.

Validate and build:

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml config
docker compose --env-file .env.production -f docker-compose.production.yml up migrator
```

Start the private services:

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml up -d app worker scheduler postgres redis ollama
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

Expected: only the app/edge path has a host binding; the app joins the private service network plus a dedicated ingress network, the worker additionally joins only the externally managed allowlisted egress network, and PostgreSQL, Redis, and Ollama remain private-only. The migrator exits successfully; app readiness is `ready` or `degraded` only when Ollama is unavailable; worker and scheduler report live per-instance heartbeats.

Stop before rollout if configuration, migration, networking, or heartbeat checks fail. Do not run `db:push`, reset a database, or remove volumes. Verify liveness, readiness, worker/scheduler health, migration journal state, queue drain, and one safe authenticated workspace operation after rollout.
