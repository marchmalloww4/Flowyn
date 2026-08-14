import { validateWorkflowDefinition } from "@/lib/workflows/validation";
import { WORKFLOW_STEP_TYPES, type JsonValue, type WorkflowDefinition, type WorkflowStep, type WorkflowStepType } from "@/lib/workflows/types";

export interface WorkflowEditorNode {
  id: string;
  type: WorkflowStepType;
  name: string;
  config: WorkflowStep["config"];
  position: { x: number; y: number };
}

export type WorkflowEditorEdgeKind = "next" | "true" | "false";

export interface WorkflowEditorEdge {
  id: string;
  source: string;
  target: string;
  kind: WorkflowEditorEdgeKind;
}

export interface WorkflowEditorLayout {
  nodes: Array<{ id: string; x: number; y: number }>;
  viewport: { x: number; y: number; zoom: number };
}

export interface WorkflowEditorState {
  schemaVersion: 1;
  entryStepId: string;
  nodes: WorkflowEditorNode[];
  edges: WorkflowEditorEdge[];
  layout: WorkflowEditorLayout;
  versionId: string | null;
  dirty: boolean;
  selectedNodeId: string | null;
  error: string | null;
  conflictVersionId: string | null;
}

function edgeId(source: string, kind: WorkflowEditorEdgeKind, target: string): string {
  return `${source}:${kind}:${target}`;
}

function addEdge(edges: WorkflowEditorEdge[], source: string, target: string, kind: WorkflowEditorEdgeKind): void {
  edges.push({ id: edgeId(source, kind, target), source, target, kind });
}

function defaultPosition(index: number): { x: number; y: number } {
  return { x: (index % 3) * 280, y: Math.floor(index / 3) * 180 };
}

function layoutForNodes(nodes: WorkflowEditorNode[]): WorkflowEditorLayout {
  return { nodes: nodes.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y })), viewport: { x: 0, y: 0, zoom: 1 } };
}

export function createDefaultWorkflowLayout(definition: WorkflowDefinition): WorkflowEditorLayout {
  return {
    nodes: definition.steps.map((step, index) => ({ id: step.id, ...defaultPosition(index) })),
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

export function deserializeWorkflowDefinition(input: WorkflowDefinition): WorkflowEditorState {
  const definition = validateWorkflowDefinition(input);
  const nodes = definition.steps.map((step, index) => ({ id: step.id, type: step.type, name: step.name, config: step.config, position: defaultPosition(index) }));
  const edges: WorkflowEditorEdge[] = [];
  for (const step of definition.steps) {
    if (step.type === "CONDITION") {
      addEdge(edges, step.id, step.config.onTrueStepId, "true");
      addEdge(edges, step.id, step.config.onFalseStepId, "false");
    } else if (step.nextStepId) {
      addEdge(edges, step.id, step.nextStepId, "next");
    }
  }
  return {
    schemaVersion: 1,
    entryStepId: definition.entryStepId,
    nodes,
    edges,
    layout: layoutForNodes(nodes),
    versionId: null,
    dirty: false,
    selectedNodeId: null,
    error: null,
    conflictVersionId: null,
  };
}

function assertSupportedType(type: string): asserts type is WorkflowStepType {
  if (!(WORKFLOW_STEP_TYPES as readonly string[]).includes(type)) throw new Error(`Unsupported workflow editor node type: ${type}.`);
}

export function serializeWorkflowEditorState(state: WorkflowEditorState): WorkflowDefinition {
  const nodeMap = new Map<string, WorkflowEditorNode>();
  for (const node of state.nodes) {
    if (nodeMap.has(node.id)) throw new Error(`Workflow editor contains a duplicate node ID: ${node.id}.`);
    assertSupportedType(node.type);
    nodeMap.set(node.id, node);
  }
  if (!nodeMap.has(state.entryStepId)) throw new Error("Workflow editor entry node is missing.");

  const outgoing = new Map<string, WorkflowEditorEdge[]>();
  const edgeIds = new Set<string>();
  for (const edge of state.edges) {
    if (edgeIds.has(edge.id)) throw new Error(`Workflow editor contains a duplicate edge ID: ${edge.id}.`);
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target) || edge.source === edge.target) throw new Error("Workflow editor contains an invalid edge.");
    const source = nodeMap.get(edge.source)!;
    if (source.type === "CONDITION" && edge.kind === "next") throw new Error("Condition nodes require true and false edges.");
    if (source.type !== "CONDITION" && edge.kind !== "next") throw new Error("Only condition nodes may have branch edges.");
    edgeIds.add(edge.id);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
  }

  const steps = state.nodes.map((node): WorkflowStep => {
    const edges = outgoing.get(node.id) ?? [];
    if (node.type === "CONDITION") {
      const trueEdges = edges.filter((edge) => edge.kind === "true");
      const falseEdges = edges.filter((edge) => edge.kind === "false");
      if (trueEdges.length !== 1 || falseEdges.length !== 1 || edges.length !== 2) throw new Error("Condition nodes require exactly one true and one false edge.");
      return { id: node.id, type: node.type, name: node.name, config: { ...node.config, onTrueStepId: trueEdges[0]!.target, onFalseStepId: falseEdges[0]!.target } } as WorkflowStep;
    }
    if (edges.length > 1) throw new Error("Non-condition nodes may have at most one next edge.");
    return { id: node.id, type: node.type, name: node.name, config: node.config, ...(edges[0] ? { nextStepId: edges[0].target } : {}) } as WorkflowStep;
  });

  return validateWorkflowDefinition({ schemaVersion: 1, entryStepId: state.entryStepId, steps });
}

export function editorStateFromDefinition(definition: WorkflowDefinition, versionId: string | null = null): WorkflowEditorState {
  return { ...deserializeWorkflowDefinition(definition), versionId };
}

export function applyWorkflowEditorLayout(state: WorkflowEditorState, layout: WorkflowEditorLayout): WorkflowEditorState {
  const positions = new Map(layout.nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
  return {
    ...state,
    nodes: state.nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position })),
    layout: { nodes: layout.nodes.map((node) => ({ ...node })), viewport: { ...layout.viewport } },
  };
}

export type { JsonValue };
