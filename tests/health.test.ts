import { describe, expect, it } from "vitest";
import { checkOllama, evaluateOllamaModels, runHealthCheck } from "@/lib/health/checks";
import { HealthCheckError } from "@/lib/health/types";

describe("dependency health checks", () => {
  it("returns an ok result for a successful probe", async () => {
    await expect(runHealthCheck("test", async () => undefined)).resolves.toMatchObject({ status: "ok", service: "test" });
  });

  it("maps probe failures without leaking the original error", async () => {
    const result = await runHealthCheck("test", async () => { throw new Error("postgres://secret-password"); });
    expect(result).toMatchObject({ status: "error", service: "test", errorCode: "UNAVAILABLE" });
    expect(JSON.stringify(result)).not.toContain("secret-password");
  });

  it("reports a configured Ollama model that is not installed", () => {
    expect(() => evaluateOllamaModels(["other:latest"], "llama3.2:3b")).toThrowError(HealthCheckError);
    expect(() => evaluateOllamaModels(["other:latest"], "llama3.2:3b")).toThrow(/not installed/);
  });

  it("maps missing-model health failures to a stable code", async () => {
    const result = await checkOllama(async () => { throw new HealthCheckError("MODEL_MISSING", "not installed"); });
    expect(result).toMatchObject({ status: "error", service: "ollama", errorCode: "MODEL_MISSING" });
  });
});