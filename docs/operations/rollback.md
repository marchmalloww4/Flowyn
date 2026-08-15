# Production rollback

Rollback is an image/process change, not a database reset. Preserve the current image, migration journal, redacted logs, heartbeat status, and backup checkpoint first.

For an application-only rollback, stop new edge traffic, drain worker and scheduler processes, start the previously approved image, and verify readiness and per-instance heartbeats. Do not roll back database migrations automatically. If the previous image cannot read the current schema, use the approved disaster-recovery procedure and human change control.

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml ps
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail 200 app worker scheduler migrator
docker compose --env-file .env.production -f docker-compose.production.yml up -d app worker scheduler
```

Stop if rollback requires deleting data, removing volumes, changing keyrings without a rotation plan, or replaying an ambiguous Slack action. `AMBIGUOUS` integration actions remain terminal and require manual reconciliation.
