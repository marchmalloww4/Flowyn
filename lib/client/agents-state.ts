import { z } from "zod";
import { FlowynClientError } from "@/lib/client/api";

export type AgentRecord = { id: string; workspaceId: string; enabled: boolean; name: string };

export type AgentRunResult = {
  runId: string;
  status: string;
  stepCount: number;
  finalResponse: string | null;
  errorCode: string | null;
};

export type AgentRunResponse = { run: AgentRunResult };

const agentRunResponseSchema = z.object({
  run: z.object({
    runId: z.string().uuid(),
    status: z.string(),
    stepCount: z.number().int().nonnegative(),
    finalResponse: z.string().nullable(),
    errorCode: z.string().nullable(),
  }),
});

function invalidAgentResponse(): FlowynClientError {
  return new FlowynClientError({
    code: "AGENT_RESPONSE_INVALID",
    message: "The agent returned an invalid run response. Try again.",
    fields: {},
    runId: null,
    correlationId: null,
    retryable: false,
  });
}

export function parseAgentRunResponse(value: unknown): AgentRunResponse {
  const parsed = agentRunResponseSchema.safeParse(value);
  if (!parsed.success) throw invalidAgentResponse();
  return parsed.data;
}

export function agentRunHistoryPath(runId: unknown): string {
  const parsed = z.string().uuid().safeParse(runId);
  if (!parsed.success) throw invalidAgentResponse();
  return `/api/agent-runs/${encodeURIComponent(parsed.data)}`;
}

export function toAgentPlainText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function filterWorkspaceAgents(agents: AgentRecord[], workspaceId: string): AgentRecord[] {
  return agents.filter((agent) => agent.workspaceId === workspaceId);
}

export function canManageAgents(role: string | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function agentRunStatus(status: string): string {
  if (status === "RUNNING") return "Running";
  if (status === "COMPLETED") return "Completed";
  if (status === "CANCELLED") return "Cancelled";
  if (status === "MAX_STEPS_REACHED") return "Maximum steps reached";
  if (status === "FAILED") return "Failed";
  return "Queued";
}
