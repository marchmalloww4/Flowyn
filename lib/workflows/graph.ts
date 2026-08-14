import { AppError } from "@/lib/security/errors";
import { parseReferencePath } from "@/lib/workflows/context";
import type { WorkflowDefinition, WorkflowStep } from "@/lib/workflows/types";

function fail(message: string): never {
  throw new AppError("WORKFLOW_INVALID_DEFINITION", 400, message);
}

function edgeIds(step: WorkflowStep): string[] {
  return step.type === "CONDITION"
    ? [step.config.onTrueStepId, step.config.onFalseStepId]
    : step.nextStepId ? [step.nextStepId] : [];
}

function collectReferences(value: unknown, references: string[]): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectReferences(item, references);
    return;
  }
  const record = value as Record<string, unknown>;
  if (record.kind === "reference" && typeof record.path === "string") {
    references.push(record.path);
    return;
  }
  for (const nested of Object.values(record)) collectReferences(nested, references);
}

function ancestorsFor(stepId: string, reverseEdges: Map<string, string[]>): Set<string> {
  const ancestors = new Set<string>();
  const pending = [...(reverseEdges.get(stepId) ?? [])];
  while (pending.length > 0) {
    const candidate = pending.pop();
    if (!candidate || ancestors.has(candidate)) continue;
    ancestors.add(candidate);
    pending.push(...(reverseEdges.get(candidate) ?? []));
  }
  return ancestors;
}

export function validateWorkflowGraph(definition: WorkflowDefinition): void {
  const stepMap = new Map<string, WorkflowStep>();
  for (const step of definition.steps) {
    if (stepMap.has(step.id)) fail(`Workflow contains a duplicate step ID: ${step.id}.`);
    stepMap.set(step.id, step);
  }
  if (!stepMap.has(definition.entryStepId)) fail("Workflow entry step is missing.");

  const reverseEdges = new Map<string, string[]>();
  for (const step of definition.steps) {
    for (const target of edgeIds(step)) {
      if (!stepMap.has(target)) fail(`Workflow contains a missing step reference: ${target}.`);
      reverseEdges.set(target, [...(reverseEdges.get(target) ?? []), step.id]);
    }
  }

  const reachable = new Set<string>();
  const pending = [definition.entryStepId];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || reachable.has(current)) continue;
    reachable.add(current);
    const step = stepMap.get(current);
    if (step) pending.push(...edgeIds(step));
  }
  if (reachable.size !== stepMap.size) fail("Workflow contains an unreachable step.");

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (stepId: string): void => {
    if (visiting.has(stepId)) fail("Workflow graph contains a cycle.");
    if (visited.has(stepId)) return;
    visiting.add(stepId);
    for (const target of edgeIds(stepMap.get(stepId)!)) visit(target);
    visiting.delete(stepId);
    visited.add(stepId);
  };
  visit(definition.entryStepId);

  for (const step of definition.steps) {
    const ancestors = ancestorsFor(step.id, reverseEdges);
    const references: string[] = [];
    collectReferences(step.config, references);
    for (const reference of references) {
      const parsed = parseReferencePath(reference);
      if (parsed.kind === "step" && !ancestors.has(parsed.stepId)) fail(`Workflow reference must target an ancestor step: ${reference}.`);
    }
  }
}
