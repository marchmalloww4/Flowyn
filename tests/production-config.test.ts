import { describe, expect, it } from "vitest";
import { getProductionConfigurationIssues, getRuntimeConfigurationIssues } from "@/lib/env";

function env(overrides: Record<string, unknown> = {}) {
  return {
    NODE_ENV: "production",
    NEXT_PUBLIC_APP_URL: "https://flowyn.example",
    BETTER_AUTH_TRUSTED_ORIGINS: "https://flowyn.example",
    BETTER_AUTH_SECRET: "flowyn-local-development-secret-change-me",
    DATABASE_URL: "postgres://flowyn:strong-password@postgres:5432/flowyn",
    REDIS_URL: "redis://redis:6379",
    OLLAMA_BASE_URL: "http://ollama:11434",
    PRODUCTION_PRIVATE_NETWORK: true,
    WEBHOOK_PUBLIC_BASE_URL: "https://flowyn.example",
    WEBHOOK_SECRET_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    AI_IDEMPOTENCY_RESPONSE_KEYRING_JSON: JSON.stringify({ v1: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" }),
    AI_IDEMPOTENCY_RESPONSE_CURRENT_KEY_VERSION: "v1",
    INTEGRATION_CREDENTIAL_KEYRING_JSON: JSON.stringify({ v1: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" }),
    INTEGRATION_CREDENTIAL_CURRENT_KEY_VERSION: "v1",
    INTEGRATION_EGRESS_ENABLED: false,
    ...overrides,
  } as never;
}

describe("production configuration validation", () => {
  it("rejects development placeholder secrets in production", () => {
    expect(getProductionConfigurationIssues(env())).toEqual(expect.arrayContaining(["BETTER_AUTH_SECRET", "WEBHOOK_SECRET_ENCRYPTION_KEY", "INTEGRATION_CREDENTIAL_KEYRING_JSON"]));
  });

  it("accepts explicit production secrets and remains egress-disabled by default", () => {
    expect(getProductionConfigurationIssues(env({ BETTER_AUTH_SECRET: "a".repeat(64), WEBHOOK_SECRET_ENCRYPTION_KEY: "b".repeat(64), AI_IDEMPOTENCY_RESPONSE_KEYRING_JSON: JSON.stringify({ v1: `${"Y".repeat(43)}=` }), INTEGRATION_CREDENTIAL_KEYRING_JSON: JSON.stringify({ v1: `${"Y".repeat(43)}=` }) }))).toEqual([]);
  });

  it("rejects insecure public URLs and trusted origins", () => {
    const issues = getRuntimeConfigurationIssues(env({ NEXT_PUBLIC_APP_URL: "http://flowyn.example", BETTER_AUTH_TRUSTED_ORIGINS: "https://*.example" }), "app");
    expect(issues).toEqual(expect.arrayContaining(["NEXT_PUBLIC_APP_URL", "BETTER_AUTH_TRUSTED_ORIGINS"]));
  });

  it("rejects private-network exceptions when the dependency URLs are local", () => {
    const issues = getRuntimeConfigurationIssues(env({ PRODUCTION_PRIVATE_NETWORK: false, DATABASE_URL: "postgres://flowyn:flowyn@localhost:5432/flowyn", REDIS_URL: "redis://localhost:6379", OLLAMA_BASE_URL: "http://localhost:11434" }), "worker");
    expect(issues).toEqual(expect.arrayContaining(["DATABASE_URL", "REDIS_URL", "OLLAMA_BASE_URL"]));
  });

  it("rejects development key material for every runtime role", () => {
    for (const role of ["app", "worker", "scheduler", "migrator"] as const) {
      const issues = getRuntimeConfigurationIssues(env(), role);
      expect(issues).toEqual(expect.arrayContaining(["BETTER_AUTH_SECRET", "WEBHOOK_SECRET_ENCRYPTION_KEY", "INTEGRATION_CREDENTIAL_KEYRING_JSON", "AI_IDEMPOTENCY_RESPONSE_KEYRING_JSON"]));
    }
  });

  it("accepts valid production configuration while keeping integration egress disabled", () => {
    const issues = getRuntimeConfigurationIssues(env({
      BETTER_AUTH_SECRET: "a".repeat(64),
      WEBHOOK_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
      AI_IDEMPOTENCY_RESPONSE_KEYRING_JSON: JSON.stringify({ v1: Buffer.alloc(32, 2).toString("base64") }),
      INTEGRATION_CREDENTIAL_KEYRING_JSON: JSON.stringify({ v1: Buffer.alloc(32, 3).toString("base64") }),
    }), "app");
    expect(issues).toEqual([]);
  });
});
