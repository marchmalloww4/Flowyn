import { afterEach, describe, expect, it } from "vitest";
import { getAgentExecutionPolicy } from "@/lib/agents/policy";
import { resetEnvForTests } from "@/lib/env";

const environmentKeys = [
  "AGENT_MAX_STEPS_DEFAULT",
  "AGENT_MAX_STEPS_HARD_LIMIT",
  "AGENT_TOTAL_TIMEOUT_MS",
  "AGENT_TOOL_TIMEOUT_MS",
  "AGENT_MAX_GOAL_CHARS",
  "AGENT_MAX_OBSERVATION_CHARS",
  "AGENT_MAX_FINAL_RESPONSE_CHARS",
] as const;
const originalEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of environmentKeys) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetEnvForTests();
});

describe("agent execution policy", () => {
  it("uses bounded defaults and the existing AI timeout for model calls", () => {
    for (const key of environmentKeys) delete process.env[key];
    resetEnvForTests();

    expect(getAgentExecutionPolicy()).toEqual({
      maxSteps: 5,
      hardMaxSteps: 12,
      totalTimeoutMs: 120000,
      modelTimeoutMs: 60000,
      toolTimeoutMs: 15000,
      maxGoalChars: 4000,
      maxObservationChars: 6000,
      maxFinalResponseChars: 8000,
    });
  });

  it("rejects a requested maxSteps above the server hard limit", () => {
    expect(() => getAgentExecutionPolicy(13)).toThrow("hard limit");
  });

  it("rejects an environment default above the hard limit", () => {
    process.env.AGENT_MAX_STEPS_DEFAULT = "13";
    resetEnvForTests();

    expect(() => getAgentExecutionPolicy()).toThrow("hard limit");
  });
});
