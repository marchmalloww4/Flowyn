import { describe, expect, it, vi } from "vitest";
import { assertRuntimeConfiguration, getRuntimeConfigurationIssues } from "@/lib/env";
import { startRuntime } from "@/lib/runtime/startup";

function validProductionEnv(overrides: Record<string, unknown> = {}) {
  return {
    NODE_ENV: "production",
    NEXT_PUBLIC_APP_URL: "https://flowyn.example",
    BETTER_AUTH_TRUSTED_ORIGINS: "https://flowyn.example",
    BETTER_AUTH_SECRET: "a".repeat(64),
    DATABASE_URL: "postgres://flowyn:strong-password@postgres:5432/flowyn",
    REDIS_URL: "redis://redis:6379",
    OLLAMA_BASE_URL: "http://ollama:11434",
    PRODUCTION_PRIVATE_NETWORK: true,
    WEBHOOK_PUBLIC_BASE_URL: "https://flowyn.example",
    WEBHOOK_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    AI_IDEMPOTENCY_RESPONSE_KEYRING_JSON: JSON.stringify({ v1: Buffer.alloc(32, 2).toString("base64") }),
    AI_IDEMPOTENCY_RESPONSE_CURRENT_KEY_VERSION: "v1",
    INTEGRATION_CREDENTIAL_KEYRING_JSON: JSON.stringify({ v1: Buffer.alloc(32, 3).toString("base64") }),
    INTEGRATION_CREDENTIAL_CURRENT_KEY_VERSION: "v1",
    INTEGRATION_EGRESS_ENABLED: false,
    ...overrides,
  } as never;
}

describe("runtime startup configuration", () => {
  it("rejects an explicit insecure database TLS setting", () => {
    expect(getRuntimeConfigurationIssues(validProductionEnv({ PRODUCTION_PRIVATE_NETWORK: false, DATABASE_URL: "postgres://flowyn:strong-password@db.example:5432/flowyn?sslmode=disable" }), "migrator")).toContain("DATABASE_URL");
  });

  it("rejects malformed encryption key material", () => {
    expect(getRuntimeConfigurationIssues(validProductionEnv({ WEBHOOK_SECRET_ENCRYPTION_KEY: "not-a-key" }), "scheduler")).toContain("WEBHOOK_SECRET_ENCRYPTION_KEY");
  });

  it("fails startup with a safe configuration error", () => {
    expect(() => assertRuntimeConfiguration({ role: "worker", env: validProductionEnv({ NEXT_PUBLIC_APP_URL: "http://flowyn.example" }) })).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("accepts valid configuration for every runtime role", () => {
    for (const role of ["app", "worker", "scheduler", "migrator"] as const) {
      expect(() => assertRuntimeConfiguration({ role, env: validProductionEnv() })).not.toThrow();
    }
  });

  it("does not initialize a runtime when configuration validation fails", async () => {
    const initializer = vi.fn(async () => "started");

    await expect(startRuntime({
      role: "worker",
      env: validProductionEnv({ NEXT_PUBLIC_APP_URL: "http://flowyn.example" }),
      initializer,
    })).rejects.toThrow(/NEXT_PUBLIC_APP_URL/);
    expect(initializer).not.toHaveBeenCalled();
  });

  it("initializes a runtime only after configuration validation succeeds", async () => {
    const initializer = vi.fn(async () => "started");

    await expect(startRuntime({ role: "scheduler", env: validProductionEnv(), initializer })).resolves.toBe("started");
    expect(initializer).toHaveBeenCalledOnce();
  });
});
