# Incident response

Preserve correlation IDs, safe error codes, migration journal state, worker/scheduler heartbeat status, and redacted structured logs. Do not copy request bodies, prompts, responses, credentials, authorization headers, or provider payloads into tickets.

Classify failures as validation, authentication/authorization, rate limit, quota, concurrency, provider, infrastructure, timeout, ambiguous external side effect, or internal. PostgreSQL is authoritative for durable state. Redis outages fail closed for bounded rate-limited operations; Ollama outage degrades readiness and fails AI operations safely.

For suspected Slack uncertainty, stop retries and inspect the durable action row. `AMBIGUOUS` is terminal and requires manual reconciliation. For worker crashes, allow guarded PostgreSQL leases and outbox dispatch recovery; do not invoke a second execution engine or manually duplicate a side effect.
