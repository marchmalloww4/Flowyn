import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { agentRuns, workflowRunDispatches, workspaceConcurrencyReservations, workspaceUsageAdmissions, workspaceUsageBuckets } from "@/lib/database/schema";

describe("Milestone 12 generated migration contract", () => {
  it("contains the additive M12 structures and no destructive SQL", () => {
    const sql = readFileSync("db/migrations/0013_minor_quasimodo.sql", "utf8").toUpperCase();
    expect(sql).toContain('CREATE TABLE "WORKSPACE_USAGE_BUCKETS"');
    expect(sql).toContain('CREATE TABLE "WORKSPACE_USAGE_ADMISSIONS"');
    expect(sql).toContain('CREATE TABLE "WORKSPACE_CONCURRENCY_RESERVATIONS"');
    expect(sql).toContain('ADD COLUMN "NEXT_ATTEMPT_AT"');
    expect(sql).toContain('ADD COLUMN "IDEMPOTENCY_KEY"');
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)|TRUNCATE|DELETE\s+FROM/u);
  });

  it("keeps the schema contract for durable admission, leases, and deferral", () => {
    expect(workspaceUsageBuckets.consumed).toBeDefined();
    expect(workspaceUsageAdmissions.operationKey).toBeDefined();
    expect(workspaceConcurrencyReservations.expiresAt).toBeDefined();
    expect(workflowRunDispatches.nextAttemptAt).toBeDefined();
    expect(agentRuns.idempotencyKey).toBeDefined();
    expect(getTableConfig(workspaceConcurrencyReservations).indexes.map((index) => index.config.name)).toContain("workspace_concurrency_reservations_source_idx");
  });
});
