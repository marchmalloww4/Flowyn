import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getDatabase, getSql } from "@/lib/database";

async function main(): Promise<void> {
  await migrate(getDatabase(), { migrationsFolder: "./db/migrations" });
  await getSql().end({ timeout: 2 });
}

main().catch((error: unknown) => {
  console.error("Database migration failed", error);
  process.exitCode = 1;
});