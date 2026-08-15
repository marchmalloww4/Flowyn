import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getEnv } from "@/lib/env";
import * as schema from "@/lib/database/schema";

export type Database = PostgresJsDatabase<typeof schema>;

type DatabaseState = { sql: ReturnType<typeof postgres>; db: Database };
let state: DatabaseState | undefined;

export function getDatabaseClientOptions(env: ReturnType<typeof getEnv> = getEnv()) {
  return {
    max: env.DATABASE_POOL_MAX,
    connect_timeout: env.DATABASE_CONNECT_TIMEOUT_SECONDS,
    idle_timeout: env.DATABASE_IDLE_TIMEOUT_SECONDS,
  };
}

export function getDatabase(): Database {
  if (!state) {
    const env = getEnv();
    const sql = postgres(env.DATABASE_URL, getDatabaseClientOptions(env));
    state = { sql, db: drizzle(sql, { schema }) };
  }
  return state.db;
}

export function getSql(): ReturnType<typeof postgres> {
  if (!state) getDatabase();
  return state!.sql;
}

export async function closeDatabase(): Promise<void> {
  if (state) {
    await state.sql.end({ timeout: 2 });
    state = undefined;
  }
}
