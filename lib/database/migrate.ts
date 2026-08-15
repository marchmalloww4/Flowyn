import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getDatabase, getSql } from "@/lib/database";
import { startRuntime } from "@/lib/runtime/startup";

export const MIGRATION_ADVISORY_LOCK_KEY = 7130413;

export function migrationLockSql(action: "lock" | "unlock"): string {
  return action === "lock" ? "select pg_advisory_lock($1)" : "select pg_advisory_unlock($1)";
}

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
  console.error("Database migration failed", error);
  process.exitCode = 1;
});
