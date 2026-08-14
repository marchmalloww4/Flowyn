"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Workspace = { id: string; name: string };
type Workflow = { id: string; workspaceId: string; name: string; description: string; enabled: boolean; currentVersion: number };
type WorkflowRun = { id: string; status: string; output: unknown; errorCode: string | null };
type ErrorBody = { error?: { message?: string } };

const defaultDefinition = JSON.stringify({ schemaVersion: 1, entryStepId: "start", steps: [{ id: "start", type: "SET_VALUE", name: "Start", config: { value: { kind: "literal", value: "Hello from Flowyn" } } }] }, null, 2);

async function readResponse<T>(response: Response): Promise<T> {
  const body = response.status === 204 ? undefined : await response.json() as T & ErrorBody;
  if (!response.ok) throw new Error((body as ErrorBody | undefined)?.error?.message ?? "Request failed.");
  return body as T;
}

export function WorkflowPanel() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [name, setName] = useState("New workflow");
  const [description, setDescription] = useState("");
  const [definition, setDefinition] = useState(defaultDefinition);
  const [runs, setRuns] = useState<Record<string, WorkflowRun>>({});
  const [runInputs, setRunInputs] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadWorkflows(nextWorkspaceId: string) {
    if (!nextWorkspaceId) return setWorkflows([]);
    const body = await readResponse<{ workflows: Workflow[] }>(await fetch(`/api/workflows?workspaceId=${encodeURIComponent(nextWorkspaceId)}`, { cache: "no-store" }));
    setWorkflows(body.workflows);
  }

  useEffect(() => { void (async () => readResponse<{ workspaces: Array<{ workspace: Workspace }> }>(await fetch("/api/workspaces", { cache: "no-store" })))().then((body) => { const next = body.workspaces.map((entry) => entry.workspace); setWorkspaces(next); setWorkspaceId(next[0]?.id ?? ""); }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load workspaces.")); }, []);
  useEffect(() => { void loadWorkflows(workspaceId).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load workflows.")); }, [workspaceId]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId) return setError("Select a workspace first.");
    setPending(true); setError(null); setMessage(null);
    try { const parsed = JSON.parse(definition) as unknown; await readResponse(await fetch("/api/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, name, description, definition: parsed, enabled: false }) })); await loadWorkflows(workspaceId); setMessage("Workflow saved as a disabled version."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save workflow."); } finally { setPending(false); }
  }

  async function toggle(workflow: Workflow) {
    setPending(true); setError(null);
    try { await readResponse(await fetch(`/api/workflows/${workflow.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !workflow.enabled }) })); await loadWorkflows(workspaceId); setMessage(workflow.enabled ? "Workflow disabled." : "Workflow enabled."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update workflow."); } finally { setPending(false); }
  }

  async function run(workflow: Workflow) {
    let input: unknown;
    try { input = JSON.parse(runInputs[workflow.id] || "{}"); } catch { setError("Run input must be valid JSON."); return; }
    setPending(true); setError(null); setMessage(null);
    try { const body = await readResponse<{ run: WorkflowRun }>(await fetch(`/api/workflows/${workflow.id}/runs`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ input }) })); setRuns((current) => ({ ...current, [workflow.id]: body.run })); setMessage("Workflow queued."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not queue workflow."); } finally { setPending(false); }
  }

  async function cancel(workflow: Workflow) {
    const run = runs[workflow.id];
    if (!run) return;
    setPending(true); setError(null);
    try { const body = await readResponse<{ run: WorkflowRun }>(await fetch(`/api/workflow-runs/${run.id}/cancel`, { method: "POST" })); setRuns((current) => ({ ...current, [workflow.id]: body.run })); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not cancel workflow."); } finally { setPending(false); }
  }

  return <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold">Durable workflows</p><p className="mt-1 text-sm text-slate-500">Define bounded JSON steps, create immutable versions, queue runs, and inspect safe durable output.</p></div><span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">Milestone 6</span></div><div className="mt-5 space-y-2"><Label htmlFor="workflow-workspace">Workspace</Label><select id="workflow-workspace" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm"><option value="">Select workspace</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></div><form onSubmit={create} className="mt-5 space-y-3 rounded-2xl border border-dashed border-slate-300 p-4 dark:border-slate-700"><p className="text-sm font-semibold">Create a versioned workflow</p><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Workflow name" required /><Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" /><div className="space-y-2"><Label htmlFor="workflow-definition">Definition JSON</Label><textarea id="workflow-definition" value={definition} onChange={(event) => setDefinition(event.target.value)} className="min-h-56 w-full rounded-2xl border bg-transparent px-4 py-3 font-mono text-xs" spellCheck={false} /><p className="text-xs text-slate-500">Only registered step types are accepted; definitions are validated on the server.</p></div><Button type="submit" disabled={pending || !workspaceId}>{pending ? "Saving..." : "Save workflow version"}</Button></form><div className="mt-6 space-y-3">{workflows.map((workflow) => { const runState = runs[workflow.id]; return <article key={workflow.id} className="rounded-2xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{workflow.name}</p><p className="mt-1 text-sm text-slate-500">Version {workflow.currentVersion} · {workflow.description || "No description."}</p></div><span className={`rounded-full px-2 py-1 text-xs ${workflow.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{workflow.enabled ? "Enabled" : "Disabled"}</span></div><div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => void toggle(workflow)} disabled={pending}>{workflow.enabled ? "Disable" : "Enable"}</Button></div><div className="mt-4 border-t pt-4"><Label htmlFor={`workflow-input-${workflow.id}`}>Run input JSON</Label><textarea id={`workflow-input-${workflow.id}`} value={runInputs[workflow.id] ?? "{}"} onChange={(event) => setRunInputs((current) => ({ ...current, [workflow.id]: event.target.value }))} className="mt-2 min-h-20 w-full rounded-2xl border bg-transparent px-4 py-3 font-mono text-xs" spellCheck={false} /><div className="mt-2 flex gap-2"><Button type="button" onClick={() => void run(workflow)} disabled={pending || !workflow.enabled}>Queue run</Button>{runState && ["QUEUED", "RUNNING", "CANCEL_REQUESTED"].includes(runState.status) && <Button type="button" variant="outline" onClick={() => void cancel(workflow)} disabled={pending}>Cancel</Button>}</div></div>{runState && <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-900"><p className="font-semibold">Run {runState.status}</p>{runState.output !== null && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(runState.output, null, 2)}</pre>}{runState.errorCode && <p className="mt-2 text-xs text-red-600">{runState.errorCode}</p>}</div>}</article>; })}{workspaceId && workflows.length === 0 && <p className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">No workflows in this workspace yet.</p>}</div>{message && <p role="status" className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">{message}</p>}{error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}</section>;
}
