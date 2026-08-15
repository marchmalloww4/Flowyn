import { describe, expect, it } from "vitest";
import { MIGRATION_ADVISORY_LOCK_KEY, migrationLockSql } from "@/lib/database/migrate";
import {
  getMigrationTarget,
  migrationTargetMatches,
  migrationTryLockSql,
  migrationUnlockSql,
} from "@/lib/database/preflight";

describe("migration release safety", () => {
  it("uses a stable PostgreSQL advisory lock and explicit lock/unlock statements", () => {
    expect(MIGRATION_ADVISORY_LOCK_KEY).toBeTypeOf("number");
    expect(migrationLockSql("lock")).toContain("pg_advisory_lock");
    expect(migrationLockSql("unlock")).toContain("pg_advisory_unlock");
  });

  it("derives the reviewed migration target and rejects file drift", () => {
    const target = getMigrationTarget();

    expect(target).toHaveLength(15);
    expect(target.at(-1)).toBe("0014_last_magus");
    expect(migrationTargetMatches(target)).toBe(true);
    expect(migrationTargetMatches(target.slice(0, -1))).toBe(false);
    expect(migrationTargetMatches([...target, "0015_unreviewed"])).toBe(false);
  });

  it("uses a non-blocking advisory-lock probe for preflight", () => {
    expect(migrationTryLockSql()).toContain("pg_try_advisory_lock");
    expect(migrationUnlockSql()).toContain("pg_advisory_unlock");
  });
});
