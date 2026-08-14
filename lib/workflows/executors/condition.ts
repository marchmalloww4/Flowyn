import { z } from "zod";
import { AppError } from "@/lib/security/errors";
import { createWorkflowContext, resolveWorkflowValue } from "@/lib/workflows/context";
import { expressionSchema } from "@/lib/workflows/validation";
import type { ConditionConfig, JsonValue, WorkflowStepExecutor } from "@/lib/workflows/types";

const conditionConfigSchema = z.object({
  left: expressionSchema,
  operator: z.enum(["equals", "not_equals", "contains", "exists", "greater_than", "less_than"]),
  right: expressionSchema.optional(),
  onTrueStepId: z.string().trim().min(1).max(80),
  onFalseStepId: z.string().trim().min(1).max(80),
}).strict();

function stable(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, stable(nested)]));
  return value;
}

function equal(left: JsonValue, right: JsonValue): boolean {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function isMissingReference(error: unknown): boolean {
  return error instanceof AppError && error.code === "WORKFLOW_REFERENCE_INVALID";
}

export const conditionExecutor: WorkflowStepExecutor<ConditionConfig> = {
  type: "CONDITION",
  configSchema: conditionConfigSchema,
  async execute(context, config) {
    const workflowContext = createWorkflowContext({ triggerInput: context.triggerInput, stepOutputs: context.stepOutputs });
    let left: JsonValue | undefined;
    let exists = true;
    try {
      left = resolveWorkflowValue(config.left, workflowContext);
    } catch (error) {
      if (config.operator !== "exists" || !isMissingReference(error)) throw error;
      exists = false;
    }
    let result: boolean;
    if (config.operator === "exists") result = exists;
    else {
      const right = config.right ? resolveWorkflowValue(config.right, workflowContext) : null;
      if (left === undefined) throw new AppError("WORKFLOW_REFERENCE_INVALID", 400, "Condition left operand is missing.");
      if (config.operator === "equals") result = equal(left, right);
      else if (config.operator === "not_equals") result = !equal(left, right);
      else if (config.operator === "contains") {
        if (typeof left === "string" && typeof right === "string") result = left.includes(right);
        else if (Array.isArray(left)) result = left.some((item) => equal(item, right));
        else throw new AppError("WORKFLOW_VALUE_INVALID", 400, "contains requires a string or array left operand.");
      } else if (config.operator === "greater_than" || config.operator === "less_than") {
        if (typeof left !== "number" || typeof right !== "number") throw new AppError("WORKFLOW_VALUE_INVALID", 400, `${config.operator} requires numeric operands.`);
        result = config.operator === "greater_than" ? left > right : left < right;
      } else result = false;
    }
    return { output: result, nextStepId: result ? config.onTrueStepId : config.onFalseStepId, safeMetadata: { operation: `CONDITION:${config.operator}`, result } };
  },
};
