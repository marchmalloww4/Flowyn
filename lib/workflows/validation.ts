import { z } from "zod";
import { validateWorkflowGraph } from "@/lib/workflows/graph";
import { workflowEditorLayoutSchema } from "@/lib/workflows/editor-layout";
import { WORKFLOW_APPROVAL_MAX_EXPIRATION_SECONDS, WORKFLOW_APPROVAL_MIN_EXPIRATION_SECONDS } from "@/lib/workflows/policy";
import { stepIdSchema } from "@/lib/workflows/primitives";
import type { JsonValue, WorkflowDefinition } from "@/lib/workflows/types";
import { integrationActionConfigSchema } from "@/lib/integrations/validation";
import { validateIntegrationApprovalPolicy } from "@/lib/workflows/integration-policy";

const MAX_JSON_DEPTH = 3;
const MAX_JSON_KEYS = 20;
const MAX_JSON_ITEMS = 20;

function isBoundedJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return typeof value !== "string" || value.length <= 12000;
  if (typeof value === "number") return Number.isFinite(value);
  if (depth >= MAX_JSON_DEPTH || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.length <= MAX_JSON_ITEMS && value.every((item) => isBoundedJsonValue(item, depth + 1));
  const entries = Object.entries(value);
  return entries.length <= MAX_JSON_KEYS && entries.every(([key, nested]) => key.length <= 120 && isBoundedJsonValue(nested, depth + 1));
}

const jsonValueSchema = z.custom<JsonValue>((value) => isBoundedJsonValue(value), "The JSON value exceeds workflow bounds.");
const pathSchema = z.string().trim().min(1).max(200);
const uuidSchema = z.string().uuid();
const expressionSchema = z.union([
  z.object({ kind: z.literal("literal"), value: jsonValueSchema }).strict(),
  z.object({ kind: z.literal("reference"), path: pathSchema }).strict(),
]);

const baseStep = {
  id: stepIdSchema,
  name: z.string().trim().min(1).max(120),
};

const setValueStepSchema = z.object({
  ...baseStep,
  type: z.literal("SET_VALUE"),
  config: z.object({ value: expressionSchema }).strict(),
  nextStepId: stepIdSchema.optional(),
}).strict();

const transformConfigSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("select"), source: expressionSchema, path: pathSchema }).strict(),
  z.object({ operation: z.literal("lowercase"), source: expressionSchema }).strict(),
  z.object({ operation: z.literal("uppercase"), source: expressionSchema }).strict(),
  z.object({ operation: z.literal("concat"), parts: z.array(expressionSchema).min(1).max(10) }).strict(),
  z.object({
    operation: z.literal("object"),
    fields: z.record(stepIdSchema, expressionSchema).superRefine((fields, ctx) => {
      if (Object.keys(fields).length < 1 || Object.keys(fields).length > 20) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Object transforms require 1-20 fields." });
    }),
  }).strict(),
]);

const transformStepSchema = z.object({
  ...baseStep,
  type: z.literal("TRANSFORM"),
  config: transformConfigSchema,
  nextStepId: stepIdSchema.optional(),
}).strict();

const conditionStepSchema = z.object({
  ...baseStep,
  type: z.literal("CONDITION"),
  config: z.object({
    left: expressionSchema,
    operator: z.enum(["equals", "not_equals", "contains", "exists", "greater_than", "less_than"]),
    right: expressionSchema.optional(),
    onTrueStepId: stepIdSchema,
    onFalseStepId: stepIdSchema,
  }).strict().superRefine((config, ctx) => {
    if (config.operator === "exists" && config.right !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "exists does not accept a right operand." });
    if (config.operator !== "exists" && config.right === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "This condition operator requires a right operand." });
  }),
}).strict();

const aiGenerateStepSchema = z.object({
  ...baseStep,
  type: z.literal("AI_GENERATE"),
  config: z.object({
    prompt: expressionSchema,
    system: expressionSchema.optional(),
    brandId: uuidSchema.optional(),
    useBrandContext: z.boolean().optional(),
    maxTokens: z.number().int().positive().max(1200).optional(),
  }).strict(),
  nextStepId: stepIdSchema.optional(),
}).strict();

const agentStepSchema = z.object({
  ...baseStep,
  type: z.literal("AGENT"),
  config: z.object({ agentId: uuidSchema, goal: expressionSchema }).strict(),
  nextStepId: stepIdSchema.optional(),
}).strict();

export const approvalConfigSchema = z.object({
  requiredRole: z.enum(["OWNER", "ADMIN"]),
  expiresAfterSeconds: z.number().int().min(WORKFLOW_APPROVAL_MIN_EXPIRATION_SECONDS).max(WORKFLOW_APPROVAL_MAX_EXPIRATION_SECONDS).optional(),
  review: expressionSchema.optional(),
}).strict();

const approvalStepSchema = z.object({
  ...baseStep,
  type: z.literal("APPROVAL"),
  config: approvalConfigSchema,
  nextStepId: stepIdSchema.optional(),
}).strict();

const integrationActionStepSchema = z.object({
  ...baseStep,
  type: z.literal("INTEGRATION_ACTION"),
  config: integrationActionConfigSchema,
  nextStepId: stepIdSchema.optional(),
}).strict();

export const workflowStepSchema = z.discriminatedUnion("type", [setValueStepSchema, transformStepSchema, conditionStepSchema, aiGenerateStepSchema, agentStepSchema, approvalStepSchema, integrationActionStepSchema]);

export const workflowDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  entryStepId: stepIdSchema,
  steps: z.array(workflowStepSchema).min(1).max(100),
}).strict();

export function validateWorkflowDefinition(input: unknown): WorkflowDefinition {
  const parsed = workflowDefinitionSchema.parse(input);
  validateWorkflowGraph(parsed);
  validateIntegrationApprovalPolicy(parsed);
  return parsed;
}

export const workflowCreateSchema = z.object({
  workspaceId: uuidSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(""),
  definition: workflowDefinitionSchema,
  enabled: z.boolean().default(false),
}).strict();

export const workflowPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  definition: workflowDefinitionSchema.optional(),
  expectedVersionId: uuidSchema.optional(),
  layout: workflowEditorLayoutSchema.optional(),
  enabled: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== "expectedVersionId"), "At least one workflow field is required.");

export const workflowRunSchema = z.object({
  input: jsonValueSchema.default({}),
}).strict();

export const workflowListQuerySchema = z.object({ workspaceId: uuidSchema }).strict();
export const workflowIdempotencyKeySchema = z.string().trim().min(1).max(120);
export const workflowApprovalListQuerySchema = z.object({ workspaceId: uuidSchema }).strict();
export const workflowApprovalDecisionSchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();

export type WorkflowDefinitionInput = z.infer<typeof workflowDefinitionSchema>;
export type WorkflowStepInput = z.infer<typeof workflowStepSchema>;
export type WorkflowCreateInput = z.infer<typeof workflowCreateSchema>;
export type WorkflowPatchInput = z.infer<typeof workflowPatchSchema>;
export type WorkflowRunInput = z.infer<typeof workflowRunSchema>;
export { expressionSchema, jsonValueSchema, pathSchema, stepIdSchema };
