"use client";

import { Background, Controls, MiniMap, ReactFlow, type Edge, type NodeChange, type Viewport } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { WorkflowEditorState } from "@/lib/workflows/editor";
import type { WorkflowEditorEdgeKind } from "@/lib/workflows/editor";
import { WorkflowNode, type WorkflowFlowNode } from "@/components/workflow-editor/workflow-node";

const nodeTypes = { workflow: WorkflowNode };

function edgeLabel(kind: WorkflowEditorEdgeKind): string | undefined {
  return kind === "next" ? undefined : kind;
}

export function WorkflowCanvas({ state, onSelectNode, onMoveNode, onViewportChange }: {
  state: WorkflowEditorState;
  onSelectNode: (nodeId: string) => void;
  onMoveNode: (nodeId: string, position: { x: number; y: number }) => void;
  onViewportChange: (viewport: Viewport) => void;
}) {
  const nodes: WorkflowFlowNode[] = state.nodes.map((node) => ({
    id: node.id,
    type: "workflow",
    position: node.position,
    data: { label: node.name, stepType: node.type },
    selected: state.selectedNodeId === node.id,
  }));
  const edges: Edge[] = state.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.kind === "next" ? undefined : edge.kind,
    type: "smoothstep",
    label: edgeLabel(edge.kind),
    labelStyle: { fontSize: 10, fontWeight: 700 },
    style: { stroke: edge.kind === "true" ? "#059669" : edge.kind === "false" ? "#e11d48" : "#64748b" },
  }));

  function handleNodesChange(changes: NodeChange<WorkflowFlowNode>[]) {
    for (const change of changes) {
      if (change.type === "position" && change.position) onMoveNode(change.id, change.position);
    }
  }

  return (
    <div className="h-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView defaultViewport={state.layout.viewport} onNodeClick={(_, node) => onSelectNode(node.id)} onNodesChange={handleNodesChange} onMoveEnd={(_, viewport) => onViewportChange(viewport)} nodesDraggable nodesConnectable={false} elementsSelectable onlyRenderVisibleElements>
        <Background gap={24} size={1} color="#cbd5e1" />
        <Controls />
        <MiniMap nodeColor={(node) => node.data?.stepType === "CONDITION" ? "#f59e0b" : "#8b5cf6"} />
      </ReactFlow>
    </div>
  );
}
