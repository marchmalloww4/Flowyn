import { describe, expect, it } from "vitest";
import { getProductionConfigurationIssues } from "@/lib/env";

function env(overrides: Record<string, unknown> = {}) {
  return {
    NODE_ENV: "production",
    BETTER_AUTH_SECRET: "flowyn-local-development-secret-change-me",
    WEBHOOK_SECRET_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
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
    expect(getProductionConfigurationIssues(env({ BETTER_AUTH_SECRET: "a".repeat(64), WEBHOOK_SECRET_ENCRYPTION_KEY: "b".repeat(64), INTEGRATION_CREDENTIAL_KEYRING_JSON: JSON.stringify({ v1: `${"Y".repeat(43)}=` }) }))).toEqual([]);
  });
});
