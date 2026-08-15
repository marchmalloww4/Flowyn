import { workflowStepAnnouncement } from "@/lib/client/workflow-editor-state";
import type { WorkflowEditorNode } from "@/lib/workflows/editor";

export function WorkflowStepList({ nodes, selectedNodeId, onSelect }: { nodes: WorkflowEditorNode[]; selectedNodeId: string | null; onSelect: (nodeId: string) => void }) {
  return <section aria-label="Accessible workflow steps" className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"><h4 className="text-sm font-semibold">Step list</h4><p className="mt-1 text-xs text-slate-500">Use this list to inspect and select every executable step without relying on the visual canvas.</p><ol className="mt-3 space-y-2">{nodes.map((node, index) => <li key={node.id}><button aria-current={selectedNodeId === node.id ? "step" : undefined} className="min-h-10 w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-700 dark:hover:bg-slate-900" onClick={() => onSelect(node.id)} type="button">{workflowStepAnnouncement(node, index)}</button></li>)}</ol></section>;
}
