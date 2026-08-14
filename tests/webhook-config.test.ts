import { afterEach, describe, expect, it } from "vitest";
import { getEnv, resetEnvForTests } from "@/lib/env";

const keys = [
  "WEBHOOK_SECRET_ENCRYPTION_KEY",
  "WEBHOOK_SECRET_KEY_VERSION",
  "WEBHOOK_REPLAY_WINDOW_SECONDS",
  "WEBHOOK_MAX_BODY_BYTES",
  "WEBHOOK_RATE_LIMIT_GLOBAL_PER_MINUTE",
  "WEBHOOK_RATE_LIMIT_TRIGGER_PER_MINUTE",
  "WEBHOOK_EVENT_RETENTION_DAYS",
  "WEBHOOK_PUBLIC_BASE_URL",
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

describe("webhook environment policy", () => {
  it("provides safe local defaults", () => {
    for (const key of keys) delete process.env[key];
    resetEnvForTests();
    const env = getEnv();
    expect(env.WEBHOOK_SECRET_KEY_VERSION).toBe("v1");
    expect(env.WEBHOOK_MAX_BODY_BYTES).toBe(262_144);
    expect(env.WEBHOOK_PUBLIC_BASE_URL).toBe("http://localhost:3000");
  });

  it("rejects unsafe webhook bounds", () => {
    process.env.WEBHOOK_MAX_BODY_BYTES = "262145";
    resetEnvForTests();
    expect(() => getEnv()).toThrow();
  });
});
