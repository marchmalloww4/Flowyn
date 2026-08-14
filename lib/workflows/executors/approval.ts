import { approvalConfigSchema } from "@/lib/workflows/validation";
import type { WorkflowApprovalConfig, WorkflowStepExecutor } from "@/lib/workflows/types";

export const approvalExecutor: WorkflowStepExecutor<WorkflowApprovalConfig> = {
  type: "APPROVAL",
  configSchema: approvalConfigSchema,
  async execute(_context, config) {
    return {
      output: null,
      nextStepId: null,
      safeMetadata: {
        operation: "APPROVAL",
        requiredRole: config.requiredRole,
        expiresAfterSeconds: config.expiresAfterSeconds ?? null,
      },
      control: {
        type: "WAITING_APPROVAL",
        requiredRole: config.requiredRole,
        ...(config.expiresAfterSeconds === undefined ? {} : { expiresAfterSeconds: config.expiresAfterSeconds }),
      },
    };
  },
};
