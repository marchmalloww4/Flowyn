import type { WorkflowEditorLayout, WorkflowEditorNode, WorkflowEditorState } from "@/lib/workflows/editor";

export type WorkflowEditorAction =
  | { type: "replace-state"; state: WorkflowEditorState }
  | { type: "select-node"; nodeId: string | null }
  | { type: "update-node"; nodeId: string; patch: Partial<Pick<WorkflowEditorNode, "name" | "config" | "position">> }
  | { type: "update-viewport"; viewport: WorkflowEditorState["layout"]["viewport"] }
  | { type: "add-graph"; nodes: WorkflowEditorNode[]; edges: WorkflowEditorState["edges"] }
  | { type: "save-succeeded"; versionId: string; layout: WorkflowEditorLayout }
  | { type: "save-failed"; message: string }
  | { type: "save-conflict"; currentVersionId: string };

export function workflowEditorReducer(state: WorkflowEditorState, action: WorkflowEditorAction): WorkflowEditorState {
  switch (action.type) {
    case "replace-state":
      return action.state;
    case "select-node":
      return { ...state, selectedNodeId: action.nodeId };
    case "update-node":
      return {
        ...state,
        nodes: state.nodes.map((node) => node.id === action.nodeId ? { ...node, ...action.patch } : node),
        dirty: true,
        error: null,
        conflictVersionId: null,
      };
    case "update-viewport":
      return { ...state, layout: { ...state.layout, viewport: action.viewport }, dirty: true, error: null, conflictVersionId: null };
    case "add-graph":
      return { ...state, nodes: [...state.nodes, ...action.nodes], edges: [...state.edges, ...action.edges], dirty: true, error: null, conflictVersionId: null };
    case "save-succeeded":
      return { ...state, versionId: action.versionId, layout: action.layout, dirty: false, error: null, conflictVersionId: null };
    case "save-failed":
      return { ...state, dirty: true, error: action.message };
    case "save-conflict":
      return { ...state, dirty: true, error: "This workflow changed in another editor.", conflictVersionId: action.currentVersionId };
  }
}
