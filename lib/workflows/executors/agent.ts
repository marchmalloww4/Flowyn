import { z } from "zod";
import { runAgent, type AgentRunError } from "@/lib/agents/runner";
import { WorkflowStepError } from "@/lib/workflows/errors";
import { createWorkflowContext, resolveWorkflowValue, sanitizeWorkflowValue } from "@/lib/workflows/context";
import { getWorkflowExecutionPolicy } from "@/lib/workflows/policy";
import { expressionSchema } from "@/lib/workflows/validation";
import type { AgentConfig, WorkflowStepExecutor } from "@/lib/workflows/types";
import { userExecutionPrincipal } from "@/lib/security/principal";

const agentConfigSchema = z.object({ agentId: z.string().uuid(), goal: expressionSchema }).strict();

export const agentExecutor: WorkflowStepExecutor<AgentConfig> = {
  type: "AGENT",
  configSchema: agentConfigSchema,
  async execute(context, config) {
    const workflowContext = createWorkflowContext({ triggerInput: context.triggerInput, stepOutputs: context.stepOutputs });
    const goal = resolveWorkflowValue(config.goal, workflowContext);
    if (typeof goal !== "string" || !goal.trim()) throw new WorkflowStepError("WORKFLOW_AGENT_INPUT_INVALID", 400, "AGENT goal must resolve to a non-empty string.");
    const principal = context.principal ?? (context.actorUserId ? userExecutionPrincipal(context.actorUserId) : undefined);
    if (!principal) throw new WorkflowStepError("WORKFLOW_PRINCIPAL_MISSING", 500, "The workflow execution principal is missing.", false);
    let agentRunId: string | undefined;
    try {
      const result = await runAgent({ ...(principal.kind === "user" ? { userId: principal.userId } : {}), principal, agentId: config.agentId, goal, provider: context.provider, db: context.db, abortSignal: context.abortSignal, onRunCreated: async (run) => { agentRunId = run.id; } });
      if (result.status === "MAX_STEPS_REACHED" || result.finalResponse === null) throw new WorkflowStepError("AGENT_MAX_STEPS", 409, "The subordinate agent reached its step limit.", false, result.runId);
      if (result.finalResponse.length > getWorkflowExecutionPolicy().maxOutputChars) throw new WorkflowStepError("WORKFLOW_OUTPUT_LIMIT", 400, "AGENT output exceeds the configured limit.", false, result.runId);
      const output = sanitizeWorkflowValue(result.finalResponse);
      return { output, nextStepId: null, agentRunId: result.runId, safeMetadata: { operation: "AGENT", agentRunId: result.runId, outputChars: result.finalResponse.length, stepCount: result.stepCount } };
    } catch (error) {
      if (error instanceof WorkflowStepError) throw error;
      const runId = (error as AgentRunError).runId ?? agentRunId;
      const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "AGENT_FAILED";
      throw new WorkflowStepError(code, error instanceof Error && "status" in error && typeof error.status === "number" ? error.status : 502, "The subordinate agent could not complete the workflow step.", false, runId);
    }
  },
};
