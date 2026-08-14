import { AppError } from "@/lib/security/errors";
import { resolveWorkflowValue } from "@/lib/workflows/context";
import type { JsonValue, WorkflowApprovalRole, WorkflowContext, WorkflowStepType, WorkflowValueExpression } from "@/lib/workflows/types";
import type { WorkspaceRole } from "@/lib/workspaces/roles";

export type WorkflowApprovalOrigin = "manual" | "schedule" | "webhook";

export interface WorkflowApprovalSafeContext extends Record<string, JsonValue> {
  workflowName: string;
  workflowStepName: string;
  runId: string;
  workflowVersion: number;
  requiredRole: WorkflowApprovalRole;
  origin: WorkflowApprovalOrigin;
  completedStepCount: number;
  completedStepTypes: WorkflowStepType[];
}

const safeStepTypes: WorkflowStepType[] = ["SET_VALUE", "TRANSFORM", "CONDITION", "AI_GENERATE", "AGENT", "INTEGRATION_ACTION"];
const APPROVAL_REVIEW_MAX_CHARS = 2000;

export function canDecideWorkflowApproval(requiredRole: WorkflowApprovalRole, currentRole: WorkspaceRole): boolean {
  return requiredRole === "OWNER" ? currentRole === "OWNER" : currentRole === "OWNER" || currentRole === "ADMIN";
}

export function buildWorkflowApprovalSafeContext(input: {
  workflowName: string;
  workflowStepName: string;
  runId: string;
  workflowVersion: number;
  requiredRole: WorkflowApprovalRole;
  origin: WorkflowApprovalOrigin;
  completedStepCount: number;
  completedStepTypes: string[];
  review?: string;
}): WorkflowApprovalSafeContext {
  return {
    workflowName: input.workflowName.slice(0, 120),
    workflowStepName: input.workflowStepName.slice(0, 120),
    runId: input.runId,
    workflowVersion: input.workflowVersion,
    requiredRole: input.requiredRole,
    origin: input.origin,
    completedStepCount: Math.max(0, Math.min(input.completedStepCount, 100)),
    completedStepTypes: input.completedStepTypes.filter((value): value is WorkflowStepType => safeStepTypes.includes(value as WorkflowStepType)).slice(0, 20),
    ...(input.review === undefined ? {} : { review: input.review.slice(0, APPROVAL_REVIEW_MAX_CHARS) }),
  };
}

export function resolveApprovalReview(expression: WorkflowValueExpression | undefined, context: WorkflowContext): string | undefined {
  if (!expression) return undefined;
  const value = resolveWorkflowValue(expression, context);
  if (typeof value !== "string") throw new AppError("WORKFLOW_APPROVAL_REVIEW_INVALID", 400, "Approval review must resolve to a string.");
  if (value.length > APPROVAL_REVIEW_MAX_CHARS) throw new AppError("WORKFLOW_APPROVAL_REVIEW_INVALID", 400, "Approval review exceeds the configured limit.");
  return value;
}
