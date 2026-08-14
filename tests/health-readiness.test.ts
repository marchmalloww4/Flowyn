import { describe, expect, it } from "vitest";
import { getReadiness } from "@/lib/health/readiness";

const ok = (service: string) => Promise.resolve({ status: "ok" as const, service });
const failed = (service: string) => Promise.resolve({ status: "error" as const, service, errorCode: "UNAVAILABLE" });

describe("readiness semantics", () => {
  it("is ready when core dependencies and migrations are healthy", async () => {
    await expect(getReadiness({ configurationIssues: () => [], checkPostgres: () => ok("postgres"), checkRedis: () => ok("redis"), checkMigrations: () => ok("migrations"), checkOllama: () => ok("ollama") })).resolves.toMatchObject({ status: "ready", degraded: false });
  });

  it("reports degraded AI without making core readiness fail", async () => {
    await expect(getReadiness({ configurationIssues: () => [], checkPostgres: () => ok("postgres"), checkRedis: () => ok("redis"), checkMigrations: () => ok("migrations"), checkOllama: () => failed("ollama") })).resolves.toMatchObject({ status: "degraded", degraded: true, checks: { ollama: { status: "error" } } });
  });

  it("fails readiness when configuration, Redis, or migrations are unavailable", async () => {
    await expect(getReadiness({ configurationIssues: () => ["BETTER_AUTH_SECRET"], checkPostgres: () => ok("postgres"), checkRedis: () => failed("redis"), checkMigrations: () => ok("migrations"), checkOllama: () => ok("ollama") })).resolves.toMatchObject({ status: "not_ready", degraded: false });
  });
});
