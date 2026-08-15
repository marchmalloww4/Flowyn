# Worker and scheduler operations

Worker and scheduler heartbeats are Redis liveness metadata under per-instance bounded prefixes. PostgreSQL remains authoritative for workflows, leases, schedules, occurrences, approvals, outbox state, quotas, and reservations.

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml exec worker npm run worker:health
docker compose --env-file .env.production -f docker-compose.production.yml exec scheduler npm run scheduler:health
```

On SIGTERM, the worker stops new dispatch and drains active work up to `RUNTIME_SHUTDOWN_TIMEOUT_MS`; forced exit leaves guarded leases for recovery. The scheduler stops polling and waits for its active cycle. A stale heartbeat is not proof of lost durable work; inspect leases and outbox rows, then let normal recovery run.

Stop a rollout if required workers or the scheduler do not report healthy heartbeats, Redis is unavailable, or queue/outbox backlog grows without guarded recovery.
