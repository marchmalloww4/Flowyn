import { getSql } from "@/lib/database";
import { getEnv, getRuntimeConfigurationIssues } from "@/lib/env";
import { checkOllama, checkPostgres, checkRedis, runHealthCheck } from "@/lib/health/checks";
import { HealthCheckError, type HealthResult } from "@/lib/health/types";

export interface ReadinessDependencies {
  configurationIssues?: () => string[];
  checkPostgres?: () => Promise<HealthResult>;
  checkRedis?: () => Promise<HealthResult>;
  checkMigrations?: () => Promise<HealthResult>;
  checkOllama?: () => Promise<HealthResult>;
}

async function defaultMigrationProbe(): Promise<void> {
  const [row] = await getSql()`select
    to_regclass('drizzle.__drizzle_migrations') as migration_journal,
    to_regclass('public.workspace_usage_buckets') as usage_table,
    to_regclass('public.workspace_usage_admissions') as admissions_table,
    to_regclass('public.workspace_concurrency_states') as concurrency_table,
    to_regclass('public.workspace_concurrency_reservations') as reservation_table,
    to_regclass('public.workflow_run_dispatches') as dispatch_table,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'workflow_run_dispatches' and column_name = 'next_attempt_at') as has_next_attempt,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'workflow_run_dispatches' and column_name = 'defer_count') as has_defer_count,
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'agent_runs' and column_name = 'idempotency_key') as has_agent_idempotency`;
  if (!row?.migration_journal || !row?.usage_table || !row?.admissions_table || !row?.concurrency_table || !row?.reservation_table || !row?.dispatch_table || !row.has_next_attempt || !row.has_defer_count || !row.has_agent_idempotency) throw new HealthCheckError("MIGRATION_PENDING", "The database schema is not ready.");
}

export function checkMigrations(probe: () => Promise<void> = defaultMigrationProbe): Promise<HealthResult> {
  return runHealthCheck("migrations", probe);
}

export async function getReadiness(dependencies: ReadinessDependencies = {}) {
  const configurationIssues = dependencies.configurationIssues?.() ?? getRuntimeConfigurationIssues(getEnv(), "app");
  const [postgres, redis, migrations, ollama] = await Promise.all([
    (dependencies.checkPostgres ?? checkPostgres)(),
    (dependencies.checkRedis ?? checkRedis)(),
    (dependencies.checkMigrations ?? checkMigrations)(),
    (dependencies.checkOllama ?? checkOllama)(),
  ]);
  const configuration: HealthResult = configurationIssues.length > 0
    ? { status: "error", service: "configuration", errorCode: "CONFIG_INVALID" }
    : { status: "ok", service: "configuration" };
  const checks = { configuration, postgres, redis, migrations, ollama };
  const coreReady = configuration.status === "ok" && postgres.status === "ok" && redis.status === "ok" && migrations.status === "ok";
  return {
    status: coreReady ? (ollama.status === "ok" ? "ready" : "degraded") : "not_ready",
    degraded: coreReady && ollama.status !== "ok",
    checks,
    configurationIssues,
  } as const;
}
