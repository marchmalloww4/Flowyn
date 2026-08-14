"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { WorkflowStepType } from "@/lib/workflows/types";

export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  stepType: WorkflowStepType;
}

export type WorkflowFlowNode = Node<WorkflowNodeData, "workflow">;

const stepColors: Record<WorkflowStepType, string> = {
  SET_VALUE: "border-slate-300 bg-white",
  TRANSFORM: "border-cyan-300 bg-cyan-50",
  CONDITION: "border-amber-300 bg-amber-50",
  AI_GENERATE: "border-violet-300 bg-violet-50",
  AGENT: "border-blue-300 bg-blue-50",
  APPROVAL: "border-emerald-300 bg-emerald-50",
  INTEGRATION_ACTION: "border-fuchsia-300 bg-fuchsia-50",
};

export function WorkflowNode({ data, selected }: NodeProps<WorkflowFlowNode>) {
  const isCondition = data.stepType === "CONDITION";
  return (
    <div className={`relative min-w-48 rounded-2xl border-2 px-4 py-3 shadow-sm transition-shadow ${stepColors[data.stepType]} ${selected ? "shadow-lg ring-2 ring-violet-400" : ""}`}>
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-2 !border-white !bg-slate-500" />
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{data.stepType.replace("_", " ")}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-950">{data.label}</p>
      {isCondition ? (
        <>
          <Handle id="true" type="source" position={Position.Bottom} style={{ left: "30%" }} className="!h-2 !w-2 !border-2 !border-white !bg-emerald-500" />
          <Handle id="false" type="source" position={Position.Bottom} style={{ left: "70%" }} className="!h-2 !w-2 !border-2 !border-white !bg-rose-500" />
          <div className="mt-2 flex justify-between text-[10px] font-semibold"><span className="text-emerald-700">true</span><span className="text-rose-700">false</span></div>
        </>
      ) : <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-2 !border-white !bg-slate-500" />}
    </div>
  );
}
