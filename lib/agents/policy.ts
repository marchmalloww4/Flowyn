import { getEnv } from "@/lib/env";

export interface AgentExecutionPolicy {
  maxSteps: number;
  hardMaxSteps: number;
  totalTimeoutMs: number;
  modelTimeoutMs: number;
  toolTimeoutMs: number;
  maxGoalChars: number;
  maxObservationChars: number;
  maxFinalResponseChars: number;
}

export function getAgentExecutionPolicy(requestedMaxSteps?: number): AgentExecutionPolicy {
  const env = getEnv();
  if (env.AGENT_MAX_STEPS_DEFAULT > env.AGENT_MAX_STEPS_HARD_LIMIT) throw new Error("Agent max steps default exceeds the hard limit.");
  if (env.AGENT_TOOL_TIMEOUT_MS > env.AGENT_TOTAL_TIMEOUT_MS) throw new Error("Agent tool timeout exceeds the total timeout.");
  const maxSteps = requestedMaxSteps ?? env.AGENT_MAX_STEPS_DEFAULT;
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > env.AGENT_MAX_STEPS_HARD_LIMIT) throw new Error("Agent max steps exceed the hard limit.");
  return Object.freeze({
    maxSteps,
    hardMaxSteps: env.AGENT_MAX_STEPS_HARD_LIMIT,
    totalTimeoutMs: env.AGENT_TOTAL_TIMEOUT_MS,
    modelTimeoutMs: env.AI_REQUEST_TIMEOUT_MS,
    toolTimeoutMs: env.AGENT_TOOL_TIMEOUT_MS,
    maxGoalChars: env.AGENT_MAX_GOAL_CHARS,
    maxObservationChars: env.AGENT_MAX_OBSERVATION_CHARS,
    maxFinalResponseChars: env.AGENT_MAX_FINAL_RESPONSE_CHARS,
  });
}
