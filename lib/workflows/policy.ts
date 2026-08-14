import { getEnv } from "@/lib/env";

export const WORKFLOW_APPROVAL_MIN_EXPIRATION_SECONDS = 60;
export const WORKFLOW_APPROVAL_MAX_EXPIRATION_SECONDS = 31_536_000;

export interface WorkflowExecutionPolicy {
  maxSteps: number;
  totalTimeoutMs: number;
  stepTimeoutMs: number;
  maxRetries: number;
  maxInputChars: number;
  maxOutputChars: number;
  maxContextChars: number;
  dispatchLeaseMs: number;
  executionLeaseMs: number;
  workerConcurrency: number;
}

export function getWorkflowExecutionPolicy(): WorkflowExecutionPolicy {
  const env = getEnv();
  if (env.WORKFLOW_STEP_TIMEOUT_MS > env.WORKFLOW_TOTAL_TIMEOUT_MS) throw new Error("Workflow step timeout exceeds the total timeout.");
  if (env.WORKFLOW_DISPATCH_LEASE_MS > env.WORKFLOW_EXECUTION_LEASE_MS) throw new Error("Workflow dispatch lease exceeds the execution lease.");
  if (env.WORKFLOW_WORKER_CONCURRENCY > 32) throw new Error("Workflow worker concurrency exceeds the hard limit.");
  return Object.freeze({
    maxSteps: env.WORKFLOW_MAX_STEPS,
    totalTimeoutMs: env.WORKFLOW_TOTAL_TIMEOUT_MS,
    stepTimeoutMs: env.WORKFLOW_STEP_TIMEOUT_MS,
    maxRetries: env.WORKFLOW_MAX_RETRIES,
    maxInputChars: env.WORKFLOW_MAX_INPUT_CHARS,
    maxOutputChars: env.WORKFLOW_MAX_OUTPUT_CHARS,
    maxContextChars: env.WORKFLOW_MAX_CONTEXT_CHARS,
    dispatchLeaseMs: env.WORKFLOW_DISPATCH_LEASE_MS,
    executionLeaseMs: env.WORKFLOW_EXECUTION_LEASE_MS,
    workerConcurrency: env.WORKFLOW_WORKER_CONCURRENCY,
  });
}
