import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { logError } from "@/lib/observability/logger";

const operationalSources = [
  "lib/database/migrate.ts",
  "worker/workflow-worker.ts",
  "lib/ai/service.ts",
  "lib/schedules/scheduler.ts",
  "lib/workflows/worker.ts",
];

describe("runtime error logging", () => {
  it("routes operational failures through the structured logger", () => {
    for (const sourcePath of operationalSources) {
      const source = readFileSync(sourcePath, "utf8");
      expect(source, sourcePath).toContain("logError");
      expect(source, sourcePath).not.toMatch(/console\.error\([^)]*\berror\b[^)]*\)/u);
    }
  });

  it("redacts secrets, connection strings, headers, and provider-sensitive fields", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logError("runtime.failure", new Error("DATABASE_URL=postgres://flowyn:db-secret@postgres:5432/flowyn"), {
      databaseUrl: "postgres://flowyn:db-secret@postgres:5432/flowyn",
      headers: { authorization: "Bearer header-secret" },
      providerPayload: { apiKey: "provider-secret" },
      safeCode: "MIGRATION_FAILED",
    });

    const serialized = errorSpy.mock.calls.map(([value]) => String(value)).join("\n");
    expect(serialized).not.toContain("db-secret");
    expect(serialized).not.toContain("header-secret");
    expect(serialized).not.toContain("provider-secret");
    expect(serialized).toContain("MIGRATION_FAILED");

    errorSpy.mockRestore();
  });
});
