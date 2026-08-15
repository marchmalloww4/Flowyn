import { getSql } from "@/lib/database";
import { getEnv } from "@/lib/env";
import { assertRuntimeConfiguration } from "@/lib/env";

async function main(): Promise<void> {
  const env = getEnv();
  assertRuntimeConfiguration({ role: "migrator", env });
  const sql = getSql();
  try {
    const [result] = await sql`select
      1 as connected,
      to_regclass('drizzle.__drizzle_migrations') as migration_journal,
      to_regclass('public.workspaces') as workspaces_table,
      to_regclass('public.ai_generation_idempotency') as ai_idempotency_table`;
    if (!result?.connected || !result.migration_journal || !result.workspaces_table || !result.ai_idempotency_table) {
      throw new Error("Database preflight failed: required schema state is missing.");
    }
    console.log(JSON.stringify({ event: "database.preflight.ok", migrationJournal: true, applicationTables: true }));
  } finally {
    await sql.end({ timeout: 2 });
  }
}

void main().catch((error: unknown) => {
  console.error(JSON.stringify({ event: "database.preflight.failed", error: error instanceof Error ? error.name : "UnknownError" }));
  process.exitCode = 1;
});
