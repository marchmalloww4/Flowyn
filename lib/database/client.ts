import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getEnv } from "@/lib/env";
import * as schema from "@/lib/database/schema";

export type Database = PostgresJsDatabase<typeof schema>;

type DatabaseState = { sql: ReturnType<typeof postgres>; db: Database };
let state: DatabaseState | undefined;

export function getDatabase(): Database {
  if (!state) {
    const sql = postgres(getEnv().DATABASE_URL, { max: 10 });
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