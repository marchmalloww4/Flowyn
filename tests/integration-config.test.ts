import { afterEach, describe, expect, it } from "vitest";
import { getEnv, resetEnvForTests } from "@/lib/env";

const keys = [
  "INTEGRATION_EGRESS_ENABLED",
  "INTEGRATION_CREDENTIAL_KEYRING_JSON",
  "INTEGRATION_CREDENTIAL_CURRENT_KEY_VERSION",
  "INTEGRATION_REQUEST_TIMEOUT_MS",
  "INTEGRATION_MAX_REQUEST_BYTES",
  "INTEGRATION_MAX_RESPONSE_BYTES",
] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetEnvForTests();
});

describe("integration environment policy", () => {
  it("fails closed and exposes bounded server-only settings", () => {
    for (const key of keys) delete process.env[key];
    resetEnvForTests();
    expect(getEnv()).toMatchObject({ INTEGRATION_EGRESS_ENABLED: false, INTEGRATION_CREDENTIAL_CURRENT_KEY_VERSION: "v1" });
  });

  it("parses false explicitly and rejects invalid bounds or missing current version", () => {
    process.env.INTEGRATION_EGRESS_ENABLED = "false";
    process.env.INTEGRATION_REQUEST_TIMEOUT_MS = "30001";
    resetEnvForTests();
    expect(() => getEnv()).toThrow();

    process.env.INTEGRATION_REQUEST_TIMEOUT_MS = "10000";
    process.env.INTEGRATION_CREDENTIAL_KEYRING_JSON = JSON.stringify({ v1: "key" });
    process.env.INTEGRATION_CREDENTIAL_CURRENT_KEY_VERSION = "v2";
    resetEnvForTests();
    expect(() => getEnv()).toThrow();
  });
});
