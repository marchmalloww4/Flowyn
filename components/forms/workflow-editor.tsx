"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { Button } from "@/components/ui/button";
import { WorkflowCanvas } from "@/components/workflow-editor/workflow-canvas";
import { WorkflowConfigPanel } from "@/components/workflow-editor/workflow-config-panel";
import { WorkflowJsonEditor } from "@/components/workflow-editor/workflow-json-editor";
import { WorkflowStepPalette } from "@/components/workflow-editor/workflow-step-palette";
import { applyWorkflowEditorLayout, createDefaultWorkflowLayout, editorStateFromDefinition, serializeWorkflowEditorState, type WorkflowEditorEdge, type WorkflowEditorNode, type WorkflowEditorState } from "@/lib/workflows/editor";
import { workflowEditorReducer } from "@/lib/workflows/editor-state";
import type { WorkflowDefinition, WorkflowStepType } from "@/lib/workflows/types";

type WorkflowProjectionResponse = {
  workflow: { id: string; name: string; currentVersion: number; currentVersionId: string | null };
  definition: WorkflowDefinition;
  currentVersionId: string;
  currentVersion: number;
  layout: WorkflowEditorState["layout"];
};

type ApiError = Error & { code?: string; currentVersionId?: string };

const emptyDefinition: WorkflowDefinition = {
  schemaVersion: 1,
  entryStepId: "start",
  steps: [{ id: "start", type: "SET_VALUE", name: "Start", config: { value: { kind: "literal", value: "" } } }],
};

function initialEditorState(): WorkflowEditorState {
  return editorStateFromDefinition(emptyDefinition);
}

async function readApi<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: { code?: string; message?: string; currentVersionId?: string } };
  if (!response.ok) {
    const error = new Error(body.error?.message ?? "Request failed.") as ApiError;
    error.code = body.error?.code;
    error.currentVersionId = body.error?.currentVersionId;
    throw error;
  }
  return body as T;
}

function nextNodeId(nodes: WorkflowEditorNode[], type: WorkflowStepType): string {
  const base = type.toLowerCase();
  let suffix = 1;
  while (nodes.some((node) => node.id === `${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function defaultNode(id: string, type: WorkflowStepType, position: { x: number; y: number }): WorkflowEditorNode {
  const literal = { kind: "literal" as const, value: "" };
  const configs: Record<WorkflowStepType, WorkflowEditorNode["config"]> = {
    SET_VALUE: { value: literal },
    TRANSFORM: { operation: "uppercase", source: literal },
    CONDITION: { left: literal, operator: "exists", onTrueStepId: id, onFalseStepId: id },
    AI_GENERATE: { prompt: literal, maxTokens: 400 },
    AGENT: { agentId: "00000000-0000-4000-8000-000000000000", goal: literal },
    APPROVAL: { requiredRole: "ADMIN", expiresAfterSeconds: 3600 },
  };
  return { id, type, name: `${type.replace("_", " ")} step`, config: configs[type], position };
}

function edge(source: string, target: string, kind: WorkflowEditorEdge["kind"]): WorkflowEditorEdge {
  return { id: `${source}:${kind}:${target}`, source, target, kind };
}

function layoutForState(state: WorkflowEditorState): WorkflowEditorState["layout"] {
  return { nodes: state.nodes.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y })), viewport: state.layout.viewport };
}

export function WorkflowEditor({ workflowId }: { workflowId: string }) {
  const [state, dispatch] = useReducer(workflowEditorReducer, undefined, initialEditorState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"canvas" | "advanced">("canvas");
  const [rawDefinition, setRawDefinition] = useState("");
  const [rawError, setRawError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadProjection = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const projection = await readApi<WorkflowProjectionResponse>(await fetch(`/api/workflows/${workflowId}`, { cache: "no-store" }));
      const next = applyWorkflowEditorLayout(editorStateFromDefinition(projection.definition, projection.currentVersionId), projection.layout);
      dispatch({ type: "replace-state", state: next });
      setMessage(null);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Could not load workflow editor.");
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => { void loadProjection(); }, [loadProjection]);

  const selectedNode = useMemo(() => state.nodes.find((node) => node.id === state.selectedNodeId) ?? null, [state.nodes, state.selectedNodeId]);

  function addStep(type: WorkflowStepType) {
    const outgoing = new Set(state.edges.filter((current) => current.kind === "next").map((current) => current.source));
    const terminal = state.nodes.find((node) => node.type !== "CONDITION" && !outgoing.has(node.id));
    if (!terminal) {
      dispatch({ type: "save-failed", message: "The current graph has no safe terminal step for insertion." });
      return;
    }
    const id = nextNodeId(state.nodes, type);
    if (type !== "CONDITION") {
      const node = defaultNode(id, type, { x: terminal.position.x + 280, y: terminal.position.y });
      dispatch({ type: "add-graph", nodes: [node], edges: [edge(terminal.id, node.id, "next")] });
      return;
    }
    const trueId = nextNodeId([...state.nodes, defaultNode(id, type, { x: 0, y: 0 })], "SET_VALUE");
    const falseId = nextNodeId([...state.nodes, defaultNode(id, type, { x: 0, y: 0 }), defaultNode(trueId, "SET_VALUE", { x: 0, y: 0 })], "SET_VALUE");
    const condition = defaultNode(id, type, { x: terminal.position.x + 280, y: terminal.position.y });
    condition.config = { left: { kind: "literal", value: true }, operator: "exists", onTrueStepId: trueId, onFalseStepId: falseId };
    const trueNode = defaultNode(trueId, "SET_VALUE", { x: condition.position.x + 240, y: condition.position.y - 100 });
    const falseNode = defaultNode(falseId, "SET_VALUE", { x: condition.position.x + 240, y: condition.position.y + 100 });
    dispatch({ type: "add-graph", nodes: [condition, trueNode, falseNode], edges: [edge(terminal.id, condition.id, "next"), edge(condition.id, trueNode.id, "true"), edge(condition.id, falseNode.id, "false")] });
  }

  function applyRawDefinition() {
    try {
      const parsed = JSON.parse(rawDefinition) as WorkflowDefinition;
      const parsedState = editorStateFromDefinition(parsed, state.versionId);
      const defaultLayout = createDefaultWorkflowLayout(parsed);
      const positioned = applyWorkflowEditorLayout(parsedState, { nodes: defaultLayout.nodes.map((node) => state.layout.nodes.find((saved) => saved.id === node.id) ?? node), viewport: state.layout.viewport });
      dispatch({ type: "replace-state", state: { ...positioned, dirty: true } });
      setRawError(null);
      setMessage("Advanced definition applied to the canvas. Save to create a new version.");
    } catch (cause) {
      setRawError(cause instanceof Error ? cause.message : "Definition JSON is invalid.");
    }
  }

  async function save() {
    if (!state.versionId) return dispatch({ type: "save-failed", message: "Load the current workflow version before saving." });
    setSaving(true); setMessage(null);
    try {
      const definition = serializeWorkflowEditorState(state);
      const layout = layoutForState(state);
      const body = await readApi<{ workflow: WorkflowProjectionResponse["workflow"] }>(await fetch(`/api/workflows/${workflowId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ definition, layout, expectedVersionId: state.versionId }) }));
      dispatch({ type: "save-succeeded", versionId: body.workflow.currentVersionId ?? state.versionId, layout });
      setMessage(`Saved executable version ${body.workflow.currentVersion}.`);
    } catch (cause) {
      const error = cause as ApiError;
      if (error.code === "WORKFLOW_VERSION_CONFLICT") {
        try {
          const current = await readApi<WorkflowProjectionResponse>(await fetch(`/api/workflows/${workflowId}`, { cache: "no-store" }));
          dispatch({ type: "save-conflict", currentVersionId: current.currentVersionId });
        } catch {
          dispatch({ type: "save-failed", message: "This workflow changed in another editor. Reload before saving." });
        }
      } else dispatch({ type: "save-failed", message: error instanceof Error ? error.message : "Could not save workflow." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="rounded-2xl border border-slate-200 p-5 text-sm text-slate-500 dark:border-slate-800">Loading visual editor…</div>;
  if (loadError) return <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{loadError}</div>;

  return <section className="rounded-3xl border border-violet-200 bg-white p-5 shadow-sm dark:border-violet-900/60 dark:bg-slate-950"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-600">Visual workflow editor</p><h3 className="mt-1 text-xl font-semibold">Edit the executable graph safely</h3><p className="mt-1 text-sm text-slate-500">Version {state.versionId ? "loaded" : "unloaded"}. Layout changes never enter the executable definition.</p></div><div className="flex gap-2"><Button type="button" variant={mode === "canvas" ? "default" : "outline"} size="sm" onClick={() => setMode("canvas")}>Canvas</Button><Button type="button" variant={mode === "advanced" ? "default" : "outline"} size="sm" onClick={() => { setMode("advanced"); setRawDefinition(JSON.stringify(serializeWorkflowEditorState(state), null, 2)); }}>Advanced JSON</Button><Button type="button" size="sm" onClick={() => void save()} disabled={saving || !state.dirty}>{saving ? "Saving…" : "Save version"}</Button></div></div>{mode === "canvas" ? <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]"><div className="space-y-4"><WorkflowCanvas state={state} onSelectNode={(nodeId) => dispatch({ type: "select-node", nodeId })} onMoveNode={(nodeId, position) => dispatch({ type: "update-node", nodeId, patch: { position } })} onViewportChange={(viewport) => dispatch({ type: "update-viewport", viewport })} /><WorkflowStepPalette onAdd={addStep} /></div><div className="space-y-4"><WorkflowConfigPanel node={selectedNode} onUpdate={(patch) => selectedNode && dispatch({ type: "update-node", nodeId: selectedNode.id, patch })} /><div className="rounded-2xl border border-slate-200 p-4 text-xs leading-5 text-slate-500 dark:border-slate-800">The server enforces the six registered step types, graph reachability, workspace ownership, and agent/brand references on every executable save.</div></div></div> : <div className="mt-5"><WorkflowJsonEditor value={rawDefinition} onChange={setRawDefinition} onApply={applyRawDefinition} error={rawError} /></div>}{state.error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}{message && <p role="status" className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">{message}</p>}</section>;
}
