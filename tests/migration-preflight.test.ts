import { describe, expect, it } from "vitest";
import { MIGRATION_ADVISORY_LOCK_KEY, migrationLockSql } from "@/lib/database/migrate";

describe("migration release safety", () => {
  it("uses a stable PostgreSQL advisory lock and explicit lock/unlock statements", () => {
    expect(MIGRATION_ADVISORY_LOCK_KEY).toBeTypeOf("number");
    expect(migrationLockSql("lock")).toContain("pg_advisory_lock");
    expect(migrationLockSql("unlock")).toContain("pg_advisory_unlock");
  });
});
