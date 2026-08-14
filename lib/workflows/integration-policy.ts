import { AppError } from "@/lib/security/errors";
import { getConnectorOperation } from "@/lib/integrations/registry";
import type { WorkflowDefinition, WorkflowStep } from "@/lib/workflows/types";

function fail(message: string): never {
  throw new AppError("WORKFLOW_INTEGRATION_APPROVAL_REQUIRED", 400, message);
}

function edgeIds(step: WorkflowStep): string[] {
  return step.type === "CONDITION" ? [step.config.onTrueStepId, step.config.onFalseStepId] : step.nextStepId ? [step.nextStepId] : [];
}

export function validateIntegrationApprovalPolicy(definition: WorkflowDefinition, operationPolicy: (connectorId: string, operationId: string) => { requiresApproval: boolean } = getConnectorOperation): void {
  const steps = new Map(definition.steps.map((step) => [step.id, step]));
  const pending: Array<{ stepId: string; approved: boolean }> = [{ stepId: definition.entryStepId, approved: false }];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    const stateKey = `${current.stepId}:${current.approved ? "approved" : "unapproved"}`;
    if (seen.has(stateKey)) continue;
    seen.add(stateKey);
    const step = steps.get(current.stepId);
    if (!step) continue;
    let approved = current.approved;
    if (step.type === "APPROVAL") approved = true;
    if (step.type === "INTEGRATION_ACTION") {
      let requiresApproval: boolean;
      try { requiresApproval = operationPolicy(step.config.connectorId, step.config.operation).requiresApproval; } catch { fail("Workflow integration operation is not supported."); }
      if (requiresApproval && !approved) fail(`Every reachable path to integration action ${step.id} must pass through an approval step.`);
    }
    for (const target of edgeIds(step)) pending.push({ stepId: target, approved });
  }
}
