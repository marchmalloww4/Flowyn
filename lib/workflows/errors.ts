import { AIError } from "@/lib/ai/errors";
import { AppError } from "@/lib/security/errors";

export class WorkflowStepError extends AppError {
  constructor(code: string, status: number, message: string, public readonly retryable = false, public readonly agentRunId?: string) {
    super(code, status, message);
    this.name = "WorkflowStepError";
  }
}

export interface WorkflowErrorClassification {
  code: string;
  retryable: boolean;
  status: number;
}

export function classifyWorkflowError(error: unknown): WorkflowErrorClassification {
  if (error instanceof WorkflowStepError) return { code: error.code, retryable: error.retryable, status: error.status };
  if (error instanceof AIError) return { code: `AI_${error.code}`, retryable: false, status: error.status };
  if (error instanceof AppError) return { code: error.code, retryable: false, status: error.status };
  return { code: "WORKFLOW_STEP_FAILED", retryable: false, status: 500 };
}
