import { AppError } from "@/lib/security/errors";
import { getWorkflowExecutionPolicy } from "@/lib/workflows/policy";
import type { JsonValue, WorkflowContext, WorkflowValueExpression } from "@/lib/workflows/types";

const unsafeSegments = new Set(["__proto__", "prototype", "constructor"]);
const maxDepth = 6;

function contextError(message: string): AppError {
  return new AppError("WORKFLOW_CONTEXT_LIMIT", 400, message);
}

function referenceError(message: string): AppError {
  return new AppError("WORKFLOW_REFERENCE_INVALID", 400, message);
}

export type ParsedReference =
  | { kind: "trigger"; path: string[] }
  | { kind: "step"; stepId: string; path: string[] };

export function parseReferencePath(path: string): ParsedReference {
  const segments = path.split(".");
  if (segments.some((segment) => !segment || unsafeSegments.has(segment))) throw referenceError("Workflow reference contains an unsafe path segment.");
  if (segments[0] === "trigger") return { kind: "trigger", path: segments.slice(1) };
  if (segments[0] === "steps" && segments.length >= 3 && segments[2] === "output") return { kind: "step", stepId: segments[1]!, path: segments.slice(3) };
  throw referenceError("Workflow reference must start with trigger or steps.<id>.output.");
}

export function sanitizeWorkflowValue(value: unknown, depth = 0): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    if (typeof value === "string" && value.length > 12000) throw contextError("Workflow context contains an oversized string.");
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw contextError("Workflow context contains a non-finite number.");
    return value;
  }
  if (depth >= maxDepth || value === undefined || typeof value !== "object") throw contextError("Workflow context exceeds its safe JSON bounds.");
  if (Array.isArray(value)) {
    if (value.length > 20) throw contextError("Workflow context contains too many array items.");
    return value.map((item) => sanitizeWorkflowValue(item, depth + 1));
  }
  const sanitized: Record<string, JsonValue> = {};
  const entries = Object.entries(value);
  if (entries.length > 20) throw contextError("Workflow context contains too many object fields.");
  for (const [key, nested] of entries) {
    if (unsafeSegments.has(key)) continue;
    sanitized[key] = sanitizeWorkflowValue(nested, depth + 1);
  }
  return sanitized;
}

export function createWorkflowContext(input: { triggerInput: unknown; stepOutputs: Record<string, unknown> }): WorkflowContext {
  const context: WorkflowContext = {
    trigger: sanitizeWorkflowValue(input.triggerInput),
    steps: Object.fromEntries(Object.entries(input.stepOutputs).map(([stepId, output]) => [stepId, { output: sanitizeWorkflowValue(output) }])),
  };
  const serialized = JSON.stringify(context);
  if (serialized.length > getWorkflowExecutionPolicy().maxContextChars) throw contextError("Workflow context exceeds the configured character limit.");
  return context;
}

function readPath(value: JsonValue, path: string[]): JsonValue {
  let current: JsonValue = value;
  for (const segment of path) {
    if (unsafeSegments.has(segment) || !current || typeof current !== "object" || !(segment in current)) throw referenceError("Workflow reference points to a missing or unsafe value.");
    current = Array.isArray(current) ? current[Number(segment)] ?? null : (current as Record<string, JsonValue>)[segment]!;
  }
  return current;
}

export function resolveWorkflowValue(expression: WorkflowValueExpression, context: WorkflowContext): JsonValue {
  if (expression.kind === "literal") return sanitizeWorkflowValue(expression.value);
  const parsed = parseReferencePath(expression.path);
  if (parsed.kind === "trigger") return readPath(context.trigger, parsed.path);
  const step = context.steps[parsed.stepId];
  if (!step) throw referenceError("Workflow reference points to a step with no completed output.");
  return readPath(step.output, parsed.path);
}
