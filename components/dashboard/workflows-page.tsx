"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Play, Workflow as WorkflowIcon } from "lucide-react";
import { WorkflowEditor } from "@/components/forms/workflow-editor";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiRequest, FlowynClientError } from "@/lib/client/api";
import { canManageWorkflows, filterWorkspaceWorkflows, workflowStatusLabel, type WorkflowRecord } from "@/lib/client/workflows-state";

type Workflow = WorkflowRecord & { description: string; deletedAt: string | null };
type WorkflowRun = { id: string; status: string; output: unknown; errorCode: string | null };

const defaultDefinition = { entryStepId: "start", schemaVersion: 1, steps: [{ config: { value: { kind: "literal", value: "Hello from Flowyn" } }, id: "start", name: "Start", type: "SET_VALUE" }] };

function safeError(error: unknown, fallback: string) {
  return error instanceof FlowynClientError ? error.details.message : fallback;
}

export function WorkflowsPage() {
  const { selectedMembership, selectedWorkspace, selectedWorkspaceId } = useWorkspace();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [name, setName] = useState("New workflow");
  const [description, setDescription] = useState("");
  const [definition, setDefinition] = useState(JSON.stringify(defaultDefinition, null, 2));
  const [runInputs, setRunInputs] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState<Record<string, WorkflowRun>>({});
  const [deleteTarget, setDeleteTarget] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManage = canManageWorkflows(selectedMembership?.role);

  useEffect(() => {
    const controller = new AbortController();
    setWorkflows([]); setSelectedWorkflowId(null); setRuns({}); setMessage(null); setError(null);
    if (!selectedWorkspaceId) return () => controller.abort();
    setLoading(true);
    void apiRequest<{ workflows: Workflow[] }>(`/api/workflows?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`, { cache: "no-store", signal: controller.signal })
      .then((body) => {
        const next = filterWorkspaceWorkflows(body.workflows, selectedWorkspaceId) as Workflow[];
        setWorkflows(next); setSelectedWorkflowId(next[0]?.id ?? null);
      })
      .catch((caughtError: unknown) => { if (!controller.signal.aborted) setError(safeError(caughtError, "Workflows could not be loaded.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedWorkspaceId]);

  async function refresh() {
    if (!selectedWorkspaceId) return;
    const body = await apiRequest<{ workflows: Workflow[] }>(`/api/workflows?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`, { cache: "no-store" });
    const next = filterWorkspaceWorkflows(body.workflows, selectedWorkspaceId) as Workflow[];
    setWorkflows(next);
    if (selectedWorkflowId && !next.some((workflow) => workflow.id === selectedWorkflowId)) setSelectedWorkflowId(next[0]?.id ?? null);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWorkspaceId || !canManage) return;
    setPending(true); setError(null); setMessage(null);
    try {
      await apiRequest("/api/workflows", { body: JSON.stringify({ definition: JSON.parse(definition) as unknown, description, enabled: false, name, workspaceId: selectedWorkspaceId }), headers: { "content-type": "application/json" }, method: "POST" });
      await refresh(); setMessage("Workflow saved as a disabled version.");
    } catch (caughtError) { setError(safeError(caughtError, "Workflow could not be created. Check the definition.")); } finally { setPending(false); }
  }

  async function toggle(workflow: Workflow) {
    setPending(true); setError(null);
    try { await apiRequest(`/api/workflows/${encodeURIComponent(workflow.id)}`, { body: JSON.stringify({ enabled: !workflow.enabled }), headers: { "content-type": "application/json" }, method: "PATCH" }); await refresh(); setMessage(workflow.enabled ? "Workflow disabled." : "Workflow enabled."); }
    catch (caughtError) { setError(safeError(caughtError, "Workflow could not be updated.")); } finally { setPending(false); }
  }

  async function run(workflow: Workflow) {
    let input: unknown;
    try { input = JSON.parse(runInputs[workflow.id] || "{}"); } catch { setError("Run input must be valid JSON."); return; }
    setPending(true); setError(null);
    try {
      const key = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `workflow-${Date.now()}`;
      const body = await apiRequest<{ run: WorkflowRun }>(`/api/workflows/${encodeURIComponent(workflow.id)}/runs`, { body: JSON.stringify({ input }), headers: { "content-type": "application/json", "idempotency-key": key }, method: "POST" });
      setRuns((current) => ({ ...current, [workflow.id]: body.run })); setMessage("Workflow queued.");
    } catch (caughtError) { setError(safeError(caughtError, "Workflow could not be queued.")); } finally { setPending(false); }
  }

  async function cancel(workflow: Workflow) {
    const runState = runs[workflow.id];
    if (!runState) return;
    setPending(true); setError(null);
    try { const body = await apiRequest<{ run: WorkflowRun }>(`/api/workflow-runs/${encodeURIComponent(runState.id)}/cancel`, { method: "POST" }); setRuns((current) => ({ ...current, [workflow.id]: body.run })); setMessage("Cancellation requested."); }
    catch (caughtError) { setError(safeError(caughtError, "Workflow could not be cancelled.")); } finally { setPending(false); }
  }

  async function remove() {
    if (!deleteTarget) return;
    setPending(true); setError(null);
    try { await apiRequest(`/api/workflows/${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" }); setDeleteTarget(null); await refresh(); setMessage("Workflow deleted."); }
    catch (caughtError) { setError(safeError(caughtError, "Workflow could not be deleted.")); } finally { setPending(false); }
  }

  return (
    <div className="space-y-8">
      <header><p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-600">Workflows</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">Compose durable work.</h1><p className="mt-3 max-w-2xl text-slate-500">A workflow is a sequence of tasks Flowyn can run for you. Use the registered step types, visual editor, immutable versions, and durable run controls already provided by Flowyn.</p></header>
      {message ? <InlineAlert tone="success">{message}</InlineAlert> : null}
      {error ? <InlineAlert title="Workflow operation unavailable" tone="error">{error}</InlineAlert> : null}
      {!selectedWorkspace ? <EmptyState title="Select a workspace first" description="Workflows are isolated by workspace and validated on the server." /> : (
        <>
          {canManage ? <form className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950" onSubmit={(event) => void create(event)}><h2 className="text-lg font-semibold">Create a disabled workflow version</h2><p className="mt-1 text-sm text-slate-500">Start with a name such as “Weekend Brownie Promotion”, “Weekly Marketing Content”, or “Customer Enquiry Review”.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><FormField description="Choose a name that explains the job this sequence performs." htmlFor="workflow-name" label="Workflow name"><Input id="workflow-name" onChange={(event) => setName(event.target.value)} placeholder="Weekend Brownie Promotion" required value={name} /></FormField><FormField description="Optional context for teammates reviewing this workflow." htmlFor="workflow-description" label="Description"><Input id="workflow-description" onChange={(event) => setDescription(event.target.value)} value={description} /></FormField></div><FormField className="mt-4" description="The server validates registered step types, graph reachability, workspace references, approvals, and integration policy." htmlFor="workflow-definition" label="Definition JSON"><textarea className="min-h-48 w-full rounded-2xl border bg-transparent px-4 py-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-violet-500" id="workflow-definition" onChange={(event) => setDefinition(event.target.value)} spellCheck={false} value={definition} /></FormField><Button className="mt-4" disabled={pending} type="submit">Save workflow version</Button></form> : <InlineAlert tone="info" title="Read-only workflow role">Members can run and cancel workflows. Creating, editing, enabling, and deleting remain server-authorized management actions.</InlineAlert>}
          {loading ? <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-44" label="Loading workflow" /><Skeleton className="h-44" label="Loading workflow" /></div> : workflows.length === 0 ? <EmptyState title="No workflows yet" description={canManage ? "Create a named sequence of tasks, then review it in the visual editor before enabling it." : "A workspace administrator can create a workflow."} /> : <div className="grid gap-5 lg:grid-cols-2">{workflows.map((workflow) => {
            const runState = runs[workflow.id];
            const activeRun = runState && ["QUEUED", "RUNNING", "CANCEL_REQUESTED"].includes(runState.status);
            return <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950" key={workflow.id}><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><WorkflowIcon aria-hidden className="mt-0.5 h-5 w-5 text-violet-600" /><div><h2 className="font-semibold">{workflow.name}</h2><p className="mt-1 text-sm text-slate-500">Version {workflow.currentVersion} · {workflow.description || "No description."}</p></div></div><StatusBadge tone={workflow.enabled ? "success" : "neutral"}>{workflow.enabled ? "Enabled" : "Disabled"}</StatusBadge></div><div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => setSelectedWorkflowId(workflow.id)} size="sm" variant={selectedWorkflowId === workflow.id ? "default" : "outline"}>Edit visually</Button>{canManage ? <><Button disabled={pending} onClick={() => void toggle(workflow)} size="sm" variant="outline">{workflow.enabled ? "Disable" : "Enable"}</Button><Button disabled={pending} onClick={() => setDeleteTarget(workflow)} size="sm" variant="outline">Delete</Button></> : null}</div><div className="mt-4 border-t pt-4"><FormField description="Use a bounded JSON object; the server validates the input." htmlFor={`workflow-input-${workflow.id}`} label="Run input JSON"><textarea className="mt-2 min-h-20 w-full rounded-2xl border bg-transparent px-4 py-3 font-mono text-xs" id={`workflow-input-${workflow.id}`} onChange={(event) => setRunInputs((current) => ({ ...current, [workflow.id]: event.target.value }))} spellCheck={false} value={runInputs[workflow.id] ?? "{}"} /></FormField><div className="mt-3 flex flex-wrap gap-2"><Button disabled={pending || !workflow.enabled} onClick={() => void run(workflow)} type="button"><Play aria-hidden className="h-4 w-4" />Queue run</Button>{activeRun ? <Button disabled={pending} onClick={() => void cancel(workflow)} type="button" variant="outline">Cancel</Button> : null}</div></div>{runState ? <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-900"><StatusBadge tone={runState.status === "COMPLETED" ? "success" : runState.status === "FAILED" ? "danger" : "info"}>{workflowStatusLabel(runState.status)}</StatusBadge>{runState.output !== null && runState.output !== undefined ? <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(runState.output, null, 2)}</pre> : null}{runState.errorCode ? <p className="mt-2 text-xs text-rose-700">Failure code: {runState.errorCode}</p> : null}</div> : null}</article>;
          })}</div>}
          {selectedWorkflowId ? <WorkflowEditor workflowId={selectedWorkflowId} /> : null}
        </>
      )}
      {deleteTarget ? <ConfirmDialog confirmLabel="Delete workflow" description={`Delete ${deleteTarget.name}? Existing durable runs remain governed by server state.`} onCancel={() => setDeleteTarget(null)} onConfirm={() => void remove()} open pending={pending} title="Delete workflow" destructive /> : null}
    </div>
  );
}
