import { z } from "zod";
import { createWorkflowContext, resolveWorkflowValue, sanitizeWorkflowValue } from "@/lib/workflows/context";
import { getWorkflowExecutionPolicy } from "@/lib/workflows/policy";
import { expressionSchema } from "@/lib/workflows/validation";
import type { SetValueConfig, WorkflowStepExecutor } from "@/lib/workflows/types";

const setValueConfigSchema = z.object({ value: expressionSchema }).strict();

function metadata(output: unknown): Record<string, string | number | boolean | null> {
  return { operation: "SET_VALUE", outputChars: JSON.stringify(output).length };
}

export const setValueExecutor: WorkflowStepExecutor<SetValueConfig> = {
  type: "SET_VALUE",
  configSchema: setValueConfigSchema,
  async execute(context, config) {
    const output = sanitizeWorkflowValue(resolveWorkflowValue(config.value, createWorkflowContext({ triggerInput: context.triggerInput, stepOutputs: context.stepOutputs })));
    if (JSON.stringify(output).length > getWorkflowExecutionPolicy().maxOutputChars) throw new Error("Workflow output exceeds the configured limit.");
    return { output, nextStepId: null, safeMetadata: metadata(output) };
  },
};
