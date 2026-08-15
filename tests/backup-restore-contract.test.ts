import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("backup and restore contracts", () => {
  it("keeps backup and restore scripts non-destructive to the application database", () => {
    const backup = readFileSync("scripts/backup-postgres.ps1", "utf8");
    const restore = readFileSync("scripts/restore-drill.ps1", "utf8");
    expect(backup).toContain("pg_dump");
    expect(restore).toContain("pg_restore");
    expect(restore).toContain("TemporaryTargetConfirmed");
    expect(restore).not.toMatch(/DATABASE_URL.*DROP|DROP.*DATABASE_URL/iu);
    expect(restore).not.toContain("npm run db:push");
  });
});
