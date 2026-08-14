import { approvalConfigSchema } from "@/lib/workflows/validation";
import { createWorkflowContext } from "@/lib/workflows/context";
import { resolveApprovalReview } from "@/lib/workflows/approvals";
import type { WorkflowApprovalConfig, WorkflowStepExecutor } from "@/lib/workflows/types";

export const approvalExecutor: WorkflowStepExecutor<WorkflowApprovalConfig> = {
  type: "APPROVAL",
  configSchema: approvalConfigSchema,
  async execute(context, config) {
    const review = resolveApprovalReview(config.review, createWorkflowContext({ triggerInput: context.triggerInput, stepOutputs: context.stepOutputs }));
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
        ...(review === undefined ? {} : { review }),
      },
    };
  },
};
