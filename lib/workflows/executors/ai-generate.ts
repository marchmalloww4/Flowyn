import { z } from "zod";
import { generateText, getAIProvider, prepareGeneration } from "@/lib/ai/service";
import { WorkflowStepError } from "@/lib/workflows/errors";
import { createWorkflowContext, resolveWorkflowValue, sanitizeWorkflowValue } from "@/lib/workflows/context";
import { getWorkflowExecutionPolicy } from "@/lib/workflows/policy";
import { expressionSchema } from "@/lib/workflows/validation";
import type { AIGenerateConfig, WorkflowStepExecutor } from "@/lib/workflows/types";

const aiGenerateConfigSchema = z.object({
  prompt: expressionSchema,
  system: expressionSchema.optional(),
  brandId: z.string().uuid().optional(),
  useBrandContext: z.boolean().optional(),
  maxTokens: z.number().int().positive().max(1200).optional(),
}).strict();

export const aiGenerateExecutor: WorkflowStepExecutor<AIGenerateConfig> = {
  type: "AI_GENERATE",
  configSchema: aiGenerateConfigSchema,
  async execute(context, config) {
    const workflowContext = createWorkflowContext({ triggerInput: context.triggerInput, stepOutputs: context.stepOutputs });
    const prompt = resolveWorkflowValue(config.prompt, workflowContext);
    const system = config.system ? resolveWorkflowValue(config.system, workflowContext) : undefined;
    if (typeof prompt !== "string" || !prompt.trim()) throw new WorkflowStepError("WORKFLOW_AI_INPUT_INVALID", 400, "AI_GENERATE prompt must resolve to a non-empty string.");
    if (system !== undefined && typeof system !== "string") throw new WorkflowStepError("WORKFLOW_AI_INPUT_INVALID", 400, "AI_GENERATE system instructions must resolve to a string.");
    const prepared = await prepareGeneration({ userId: context.actorUserId, workspaceId: context.workspaceId, prompt, ...(system === undefined ? {} : { system }), ...(config.brandId === undefined ? {} : { brandId: config.brandId }), useBrandContext: config.useBrandContext, maxTokens: config.maxTokens, abortSignal: context.abortSignal }, context.provider ?? getAIProvider(), context.db);
    const result = await generateText(prepared, context.db);
    if (result.text.length > getWorkflowExecutionPolicy().maxOutputChars) throw new WorkflowStepError("WORKFLOW_OUTPUT_LIMIT", 400, "AI_GENERATE output exceeds the configured limit.");
    const output = sanitizeWorkflowValue(result.text);
    return { output, nextStepId: null, safeMetadata: { operation: "AI_GENERATE", model: result.model, outputChars: result.text.length, durationMs: result.durationMs } };
  },
};
