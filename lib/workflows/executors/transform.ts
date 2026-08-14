import { z } from "zod";
import { createWorkflowContext, resolveWorkflowValue, sanitizeWorkflowValue } from "@/lib/workflows/context";
import { getWorkflowExecutionPolicy } from "@/lib/workflows/policy";
import { expressionSchema } from "@/lib/workflows/validation";
import type { TransformConfig, WorkflowStepExecutor, JsonValue, WorkflowValueExpression } from "@/lib/workflows/types";
import { AppError } from "@/lib/security/errors";

const unsafeSegments = new Set(["__proto__", "prototype", "constructor"]);
const transformConfigSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("select"), source: expressionSchema, path: z.string().trim().min(1).max(200) }).strict(),
  z.object({ operation: z.literal("lowercase"), source: expressionSchema }).strict(),
  z.object({ operation: z.literal("uppercase"), source: expressionSchema }).strict(),
  z.object({ operation: z.literal("concat"), parts: z.array(expressionSchema).min(1).max(10) }).strict(),
  z.object({ operation: z.literal("object"), fields: z.record(z.string().trim().min(1).max(80), expressionSchema).superRefine((fields, ctx) => {
    if (Object.keys(fields).length < 1 || Object.keys(fields).length > 20) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Object transforms require 1-20 fields." });
  }) }).strict(),
]);

function valueError(message: string): AppError {
  return new AppError("WORKFLOW_VALUE_INVALID", 400, message);
}

function selectPath(value: JsonValue, path: string): JsonValue {
  let current = value;
  for (const segment of path.split(".")) {
    if (!segment || unsafeSegments.has(segment)) throw valueError("Transform path contains an unsafe segment.");
    if (!current || typeof current !== "object") throw valueError("Transform path points to a missing value.");
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) throw valueError("Transform array paths must use numeric segments.");
      const item = current[Number(segment)];
      if (item === undefined) throw valueError("Transform path points to a missing value.");
      current = item;
    } else {
      if (!(segment in current)) throw valueError("Transform path points to a missing value.");
      current = current[segment]!;
    }
  }
  return current;
}

function bounded(output: JsonValue): JsonValue {
  const sanitized = sanitizeWorkflowValue(output);
  if (JSON.stringify(sanitized).length > getWorkflowExecutionPolicy().maxOutputChars) throw valueError("Workflow output exceeds the configured limit.");
  return sanitized;
}

function metadata(operation: TransformConfig["operation"], output: JsonValue): Record<string, string | number | boolean | null> {
  return { operation: `TRANSFORM:${operation}`, outputChars: JSON.stringify(output).length };
}

export const transformExecutor: WorkflowStepExecutor<TransformConfig> = {
  type: "TRANSFORM",
  configSchema: transformConfigSchema,
  async execute(context, config) {
    const workflowContext = createWorkflowContext({ triggerInput: context.triggerInput, stepOutputs: context.stepOutputs });
    const resolve = (expression: WorkflowValueExpression) => resolveWorkflowValue(expression, workflowContext);
    let output: JsonValue;
    if (config.operation === "select") output = selectPath(resolve(config.source), config.path);
    else if (config.operation === "lowercase" || config.operation === "uppercase") {
      const source = resolve(config.source);
      if (typeof source !== "string") throw valueError(`${config.operation} requires a string value.`);
      output = config.operation === "lowercase" ? source.toLowerCase() : source.toUpperCase();
    } else if (config.operation === "concat") {
      const parts = config.parts.map(resolve);
      if (parts.some((part) => typeof part !== "string")) throw valueError("concat requires string values.");
      output = parts.join("");
    } else if (config.operation === "object") {
      output = Object.fromEntries(Object.entries(config.fields).map(([key, expression]) => [key, resolve(expression)]));
    } else throw valueError("Unsupported transform operation.");
    const result = bounded(output);
    return { output: result, nextStepId: null, safeMetadata: metadata(config.operation, result) };
  },
};
