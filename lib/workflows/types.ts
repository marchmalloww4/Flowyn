import type { ZodType } from "zod";
import type { Database } from "@/lib/database";
import type { LLMProvider } from "@/lib/ai/types";
import type { ExecutionPrincipal } from "@/lib/security/principal";
import type { IntegrationActionConfig } from "@/lib/integrations/types";
export type { IntegrationActionConfig } from "@/lib/integrations/types";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const WORKFLOW_STEP_TYPES = ["SET_VALUE", "TRANSFORM", "CONDITION", "AI_GENERATE", "AGENT", "APPROVAL", "INTEGRATION_ACTION"] as const;
export type WorkflowStepType = (typeof WORKFLOW_STEP_TYPES)[number];
export type WorkflowApprovalRole = "OWNER" | "ADMIN";

export interface WorkflowValueExpressionLiteral {
  kind: "literal";
  value: JsonValue;
}

export interface WorkflowValueExpressionReference {
  kind: "reference";
  path: string;
}

export type WorkflowValueExpression = WorkflowValueExpressionLiteral | WorkflowValueExpressionReference;

export interface SetValueConfig {
  value: WorkflowValueExpression;
}

export type TransformConfig =
  | { operation: "select"; source: WorkflowValueExpression; path: string }
  | { operation: "lowercase" | "uppercase"; source: WorkflowValueExpression }
  | { operation: "concat"; parts: WorkflowValueExpression[] }
  | { operation: "object"; fields: Record<string, WorkflowValueExpression> };

export type ConditionOperator = "equals" | "not_equals" | "contains" | "exists" | "greater_than" | "less_than";

export interface ConditionConfig {
  left: WorkflowValueExpression;
  operator: ConditionOperator;
  right?: WorkflowValueExpression;
  onTrueStepId: string;
  onFalseStepId: string;
}

export interface AIGenerateConfig {
  prompt: WorkflowValueExpression;
  system?: WorkflowValueExpression;
  brandId?: string;
  useBrandContext?: boolean;
  maxTokens?: number;
}

export interface AgentConfig {
  agentId: string;
  goal: WorkflowValueExpression;
}

export interface WorkflowApprovalConfig {
  requiredRole: WorkflowApprovalRole;
  expiresAfterSeconds?: number;
  review?: WorkflowValueExpression;
}

export type WorkflowStep =
  | { id: string; type: "SET_VALUE"; name: string; config: SetValueConfig; nextStepId?: string }
  | { id: string; type: "TRANSFORM"; name: string; config: TransformConfig; nextStepId?: string }
  | { id: string; type: "CONDITION"; name: string; config: ConditionConfig }
  | { id: string; type: "AI_GENERATE"; name: string; config: AIGenerateConfig; nextStepId?: string }
  | { id: string; type: "AGENT"; name: string; config: AgentConfig; nextStepId?: string }
  | { id: string; type: "APPROVAL"; name: string; config: WorkflowApprovalConfig; nextStepId?: string }
  | { id: string; type: "INTEGRATION_ACTION"; name: string; config: IntegrationActionConfig; nextStepId?: string };

export interface WorkflowDefinition {
  schemaVersion: 1;
  entryStepId: string;
  steps: WorkflowStep[];
}

export interface WorkflowContext {
  trigger: JsonValue;
  steps: Record<string, { output: JsonValue }>;
}

export interface WorkflowStepExecutionContext {
  runId: string;
  workspaceId: string;
  workflowStepId?: string;
  workflowStepRunId?: string;
  actorUserId: string | null;
  principal?: ExecutionPrincipal;
  workflowId: string;
  workflowVersion: number;
  triggerInput: JsonValue;
  stepOutputs: Record<string, JsonValue>;
  abortSignal: AbortSignal;
  db: Database;
  provider?: LLMProvider;
}

export interface WorkflowStepResult {
  output: JsonValue;
  nextStepId: string | null;
  retryable?: boolean;
  safeMetadata: Record<string, string | number | boolean | null>;
  agentRunId?: string;
  control?: WorkflowStepControl;
}

export interface WorkflowStepControl {
  type: "WAITING_APPROVAL";
  requiredRole: WorkflowApprovalRole;
  expiresAfterSeconds?: number;
  review?: string;
}

export interface WorkflowStepExecutor<TConfig> {
  type: WorkflowStepType;
  configSchema: ZodType<TConfig>;
  execute(context: WorkflowStepExecutionContext, config: TConfig): Promise<WorkflowStepResult>;
}
