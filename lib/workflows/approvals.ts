import type { JsonValue, WorkflowApprovalRole, WorkflowStepType } from "@/lib/workflows/types";
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

const safeStepTypes: WorkflowStepType[] = ["SET_VALUE", "TRANSFORM", "CONDITION", "AI_GENERATE", "AGENT"];

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
  };
}
