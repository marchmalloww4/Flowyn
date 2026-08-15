import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getDatabase, getSql } from "@/lib/database";
import { logError } from "@/lib/observability/logger";
import { startRuntime } from "@/lib/runtime/startup";
import { MIGRATION_ADVISORY_LOCK_KEY } from "@/lib/database/migration-constants";

export { MIGRATION_ADVISORY_LOCK_KEY, migrationLockSql } from "@/lib/database/migration-constants";

export async function migrateDatabase(): Promise<void> {
  const sql = getSql();
  await sql`select pg_advisory_lock(${MIGRATION_ADVISORY_LOCK_KEY})`;
  try {
    await migrate(getDatabase(), { migrationsFolder: "./db/migrations" });
  } finally {
    await sql`select pg_advisory_unlock(${MIGRATION_ADVISORY_LOCK_KEY})`;
    await sql.end({ timeout: 2 });
  }
}

async function main(): Promise<void> {
  await startRuntime({ role: "migrator", initializer: async () => {
    await migrateDatabase();
  } });
}

main().catch((error: unknown) => {
  logError("database.migration_failed", error);
  process.exitCode = 1;
});
