"use client";

import { Button } from "@/components/ui/button";
import { WORKFLOW_STEP_TYPES, type WorkflowStepType } from "@/lib/workflows/types";

const labels: Record<WorkflowStepType, string> = {
  SET_VALUE: "Set value",
  TRANSFORM: "Transform",
  CONDITION: "Condition",
  AI_GENERATE: "AI generate",
  AGENT: "Agent",
  APPROVAL: "Approval",
  INTEGRATION_ACTION: "Slack action",
};

export function WorkflowStepPalette({ onAdd }: { onAdd: (type: WorkflowStepType) => void }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 p-3 dark:border-slate-700"><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Step palette</p><div className="mt-3 grid grid-cols-2 gap-2">{WORKFLOW_STEP_TYPES.map((type) => <Button key={type} type="button" size="sm" variant="outline" className="justify-start text-xs" onClick={() => onAdd(type)}>+ {labels[type]}</Button>)}</div><p className="mt-3 text-xs leading-5 text-slate-500">New steps are inserted into the reachable graph. Configure resource IDs before saving agent or AI steps.</p></div>;
}
