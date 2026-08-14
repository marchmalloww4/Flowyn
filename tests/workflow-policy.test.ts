import { afterEach, describe, expect, it } from "vitest";
import { getWorkflowExecutionPolicy } from "@/lib/workflows/policy";
import { resetEnvForTests } from "@/lib/env";

const environmentKeys = [
  "WORKFLOW_MAX_STEPS",
  "WORKFLOW_TOTAL_TIMEOUT_MS",
  "WORKFLOW_STEP_TIMEOUT_MS",
  "WORKFLOW_MAX_RETRIES",
  "WORKFLOW_MAX_INPUT_CHARS",
  "WORKFLOW_MAX_OUTPUT_CHARS",
  "WORKFLOW_MAX_CONTEXT_CHARS",
  "WORKFLOW_DISPATCH_LEASE_MS",
  "WORKFLOW_EXECUTION_LEASE_MS",
  "WORKFLOW_WORKER_CONCURRENCY",
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

describe("workflow execution policy", () => {
  it("uses bounded local defaults", () => {
    for (const key of environmentKeys) delete process.env[key];
    resetEnvForTests();

    expect(getWorkflowExecutionPolicy()).toEqual({
      maxSteps: 20,
      totalTimeoutMs: 300000,
      stepTimeoutMs: 60000,
      maxRetries: 2,
      maxInputChars: 12000,
      maxOutputChars: 16000,
      maxContextChars: 24000,
      dispatchLeaseMs: 30000,
      executionLeaseMs: 90000,
      workerConcurrency: 1,
    });
  });

  it("rejects a step timeout above the total timeout", () => {
    process.env.WORKFLOW_TOTAL_TIMEOUT_MS = "100000";
    process.env.WORKFLOW_STEP_TIMEOUT_MS = "100001";
    resetEnvForTests();

    expect(() => getWorkflowExecutionPolicy()).toThrow("step timeout");
  });

  it("rejects worker concurrency above the hard limit", () => {
    process.env.WORKFLOW_WORKER_CONCURRENCY = "33";
    resetEnvForTests();

    expect(() => getWorkflowExecutionPolicy()).toThrow("WORKFLOW_WORKER_CONCURRENCY");
  });
});
