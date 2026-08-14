import { AppError } from "@/lib/security/errors";
import { conditionExecutor } from "@/lib/workflows/executors/condition";
import { agentExecutor } from "@/lib/workflows/executors/agent";
import { aiGenerateExecutor } from "@/lib/workflows/executors/ai-generate";
import { setValueExecutor } from "@/lib/workflows/executors/set-value";
import { transformExecutor } from "@/lib/workflows/executors/transform";
import { approvalExecutor } from "@/lib/workflows/executors/approval";
import { WORKFLOW_STEP_TYPES, type WorkflowStep, type WorkflowStepExecutor, type WorkflowStepType } from "@/lib/workflows/types";

export class WorkflowStepRegistry {
  private readonly executors = new Map<WorkflowStepType, WorkflowStepExecutor<unknown>>();

  register<TConfig>(executor: WorkflowStepExecutor<TConfig>): void {
    if (this.executors.has(executor.type)) throw new AppError("WORKFLOW_EXECUTOR_DUPLICATE", 500, `Workflow executor ${executor.type} is already registered.`);
    this.executors.set(executor.type, executor as WorkflowStepExecutor<unknown>);
  }

  get(type: WorkflowStepType): WorkflowStepExecutor<unknown> {
    const executor = this.executors.get(type);
    if (!executor) throw new AppError("WORKFLOW_EXECUTOR_NOT_FOUND", 500, `Workflow executor ${type} is not registered.`);
    return executor;
  }
}

export function createDefaultWorkflowStepRegistry(): WorkflowStepRegistry {
  const registry = new WorkflowStepRegistry();
  registry.register(setValueExecutor);
  registry.register(transformExecutor);
  registry.register(conditionExecutor);
  registry.register(aiGenerateExecutor);
  registry.register(agentExecutor);
  registry.register(approvalExecutor);
  return registry;
}

export function isWorkflowStepType(value: string): value is WorkflowStepType {
  return (WORKFLOW_STEP_TYPES as readonly string[]).includes(value);
}

export function stepTypeOf(step: WorkflowStep): WorkflowStepType {
  return step.type;
}
