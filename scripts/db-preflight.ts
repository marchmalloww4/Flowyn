import { getSql } from "@/lib/database";
import { assertRuntimeConfiguration, getEnv } from "@/lib/env";
import { logError } from "@/lib/observability/logger";
import { MIGRATION_ADVISORY_LOCK_KEY, migrationTryLockSql, migrationUnlockSql } from "@/lib/database/migration-constants";
import { getMigrationTarget, migrationTargetMatches } from "@/lib/database/preflight";

async function main(): Promise<void> {
  const env = getEnv();
  assertRuntimeConfiguration({ role: "migrator", env });
  const migrationTarget = getMigrationTarget();
  if (!migrationTargetMatches(migrationTarget)) {
    throw new Error("Database preflight failed: migration target does not match the reviewed journal and SQL files.");
  }

  const sql = getSql();
  const [lock] = await sql.unsafe(migrationTryLockSql(), [MIGRATION_ADVISORY_LOCK_KEY]);
  if (!lock?.acquired) {
    await sql.end({ timeout: 2 });
    throw new Error("Database preflight failed: migration advisory lock is unavailable.");
  }

  try {
    const [result] = await sql.unsafe(
      "select 1 as connected, count(*)::int as applied_migrations, to_regclass('drizzle.__drizzle_migrations') as migration_journal, to_regclass('public.workspaces') as workspaces_table, to_regclass('public.ai_generation_idempotency') as ai_idempotency_table from drizzle.__drizzle_migrations",
      [],
    );
    if (!result?.connected || Number(result.applied_migrations) !== migrationTarget.length || !result.migration_journal || !result.workspaces_table || !result.ai_idempotency_table) {
      throw new Error("Database preflight failed: required schema state is missing.");
    }
    console.log(JSON.stringify({
      event: "database.preflight.ok",
      migrationJournal: true,
      appliedMigrations: Number(result.applied_migrations),
      expectedMigrations: migrationTarget.length,
      targetMigration: migrationTarget.at(-1),
      advisoryLock: true,
      applicationTables: true,
    }));
  } finally {
    await sql.unsafe(migrationUnlockSql(), [MIGRATION_ADVISORY_LOCK_KEY]);
    await sql.end({ timeout: 2 });
  }
}

void main().catch((error: unknown) => {
  logError("database.preflight.failed", error);
  process.exitCode = 1;
});
