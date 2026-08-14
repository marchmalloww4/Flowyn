"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canManageWebhook, formatWebhookEventStatus } from "@/lib/webhooks/ui";

type Workspace = { id: string; name: string; role: "OWNER" | "ADMIN" | "MEMBER" };
type Workflow = { id: string; name: string; enabled: boolean };
type Webhook = { id: string; workspaceId: string; workflowId: string; publicId: string; endpointUrl?: string; name: string; enabled: boolean; secretVersion: number };
type WebhookEvent = { id: string; status: "TRIGGERED" | "SKIPPED" | "FAILED"; reasonCode: string | null; payloadSha256: string; payloadBytes: number; workflowRunId: string | null; receivedAt: string; duplicateCount: number };
type ErrorBody = { error?: { message?: string } };

async function readWebhookResponse<T>(response: Response): Promise<T> {
  const body = response.status === 204 ? undefined : await response.json() as T & ErrorBody;
  if (!response.ok) throw new Error((body as ErrorBody | undefined)?.error?.message ?? "Request failed.");
  return body as T;
}

export function WebhookPanel() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [events, setEvents] = useState<Record<string, WebhookEvent[]>>({});
  const [workspaceId, setWorkspaceId] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [name, setName] = useState("Inbound workflow trigger");
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
  const canManage = selectedWorkspace ? canManageWebhook(selectedWorkspace.role) : false;

  async function loadWorkflows(nextWorkspaceId: string) {
    if (!nextWorkspaceId) return setWorkflows([]);
    const body = await readWebhookResponse<{ workflows: Workflow[] }>(await fetch(`/api/workflows?workspaceId=${encodeURIComponent(nextWorkspaceId)}`, { cache: "no-store" }));
    setWorkflows(body.workflows);
    setWorkflowId((current) => body.workflows.some((workflow) => workflow.id === current) ? current : body.workflows[0]?.id ?? "");
  }

  async function loadWebhooks(nextWorkspaceId: string) {
    if (!nextWorkspaceId) return setWebhooks([]);
    const body = await readWebhookResponse<{ webhooks: Webhook[] }>(await fetch(`/api/workflow-webhooks?workspaceId=${encodeURIComponent(nextWorkspaceId)}`, { cache: "no-store" }));
    setWebhooks(body.webhooks);
  }

  useEffect(() => {
    void (async () => {
      const body = await readWebhookResponse<{ workspaces: Array<{ workspace: Omit<Workspace, "role">; role: Workspace["role"] }> }>(await fetch("/api/workspaces", { cache: "no-store" }));
      const nextWorkspaces = body.workspaces.map((entry) => ({ ...entry.workspace, role: entry.role }));
      setWorkspaces(nextWorkspaces);
      setWorkspaceId(nextWorkspaces[0]?.id ?? "");
    })().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load workspaces."));
  }, []);

  useEffect(() => {
    void Promise.all([loadWorkflows(workspaceId), loadWebhooks(workspaceId)]).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load webhooks."));
  }, [workspaceId]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !workflowId) return setError("Select a workspace and workflow first.");
    setPending(true); setError(null); setMessage(null); setSecret(null);
    try {
      const body = await readWebhookResponse<{ trigger: Webhook; secret: string }>(await fetch("/api/workflow-webhooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, workflowId, name }) }));
      setSecret(body.secret); setMessage("Webhook created. Copy the secret now; it will not be shown again."); await loadWebhooks(workspaceId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create webhook."); } finally { setPending(false); }
  }

  async function toggle(webhook: Webhook) {
    setPending(true); setError(null); setMessage(null);
    try { await readWebhookResponse(await fetch(`/api/workflow-webhooks/${webhook.id}/${webhook.enabled ? "disable" : "enable"}`, { method: "POST" })); await loadWebhooks(workspaceId); setMessage(webhook.enabled ? "Webhook disabled." : "Webhook enabled."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update webhook."); } finally { setPending(false); }
  }

  async function rotate(webhook: Webhook) {
    setPending(true); setError(null); setMessage(null);
    try { const body = await readWebhookResponse<{ secret: string }>(await fetch(`/api/workflow-webhooks/${webhook.id}/rotate-secret`, { method: "POST" })); setSecret(body.secret); setMessage("Secret rotated. Copy the new secret now; the old secret is revoked."); await loadWebhooks(workspaceId); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not rotate webhook secret."); } finally { setPending(false); }
  }

  async function remove(webhook: Webhook) {
    setPending(true); setError(null); setMessage(null);
    try { await readWebhookResponse(await fetch(`/api/workflow-webhooks/${webhook.id}`, { method: "DELETE" })); await loadWebhooks(workspaceId); setMessage("Webhook deleted."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete webhook."); } finally { setPending(false); }
  }

  async function showEvents(webhook: Webhook) {
    try { const body = await readWebhookResponse<{ events: WebhookEvent[] }>(await fetch(`/api/workflow-webhooks/${webhook.id}/events?limit=50`, { cache: "no-store" })); setEvents((current) => ({ ...current, [webhook.id]: body.events })); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load webhook history."); }
  }

  return <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
    <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold">Secure workflow webhooks</p><p className="mt-1 text-sm text-slate-500">Accept bounded, signed inbound events and queue the selected workflow durably.</p></div><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Milestone 8</span></div>
    <div className="mt-5 space-y-2"><Label htmlFor="webhook-workspace">Workspace</Label><select id="webhook-workspace" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm"><option value="">Select workspace</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name} ({workspace.role})</option>)}</select></div>
    {canManage && <form onSubmit={create} className="mt-5 space-y-3 rounded-2xl border border-dashed border-slate-300 p-4 dark:border-slate-700"><p className="text-sm font-semibold">Create a trigger</p><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Trigger name" required /><select value={workflowId} onChange={(event) => setWorkflowId(event.target.value)} className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm"><option value="">Select enabled workflow</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}{workflow.enabled ? "" : " (disabled)"}</option>)}</select><Button type="submit" disabled={pending || !workspaceId || !workflowId}>{pending ? "Creating..." : "Create webhook"}</Button></form>}
    {secret && <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-semibold">One-time secret</p><p className="mt-1 text-xs">Copy this secret now. Flowyn stores only an encrypted form and cannot recover it.</p><code className="mt-3 block overflow-x-auto rounded-xl bg-white p-3 text-xs">{secret}</code><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void navigator.clipboard?.writeText(secret)}>Copy secret</Button></div>}
    <div className="mt-6 space-y-3">{webhooks.map((webhook) => <article key={webhook.id} className="rounded-2xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{webhook.name}</p><p className="mt-1 break-all font-mono text-xs text-slate-500">{webhook.endpointUrl ?? `/api/hooks/${webhook.publicId}`}</p><p className="mt-1 text-xs text-slate-400">Secret version {webhook.secretVersion}</p></div><span className={`rounded-full px-2 py-1 text-xs ${webhook.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{webhook.enabled ? "Enabled" : "Disabled"}</span></div><div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => void showEvents(webhook)}>Delivery history</Button>{canManage && <><Button type="button" variant="outline" size="sm" onClick={() => void toggle(webhook)} disabled={pending}>{webhook.enabled ? "Disable" : "Enable"}</Button><Button type="button" variant="outline" size="sm" onClick={() => void rotate(webhook)} disabled={pending}>Rotate secret</Button><Button type="button" variant="outline" size="sm" onClick={() => void remove(webhook)} disabled={pending}>Delete</Button></>}</div>{events[webhook.id] && <div className="mt-4 space-y-2 border-t pt-3">{events[webhook.id].map((event) => <div key={event.id} className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-900"><div className="flex justify-between gap-3"><span className="font-semibold">{formatWebhookEventStatus(event.status, event.reasonCode)}</span><span className="text-slate-500">{new Date(event.receivedAt).toLocaleString()}</span></div><p className="mt-1 text-slate-500">{event.payloadBytes} bytes · duplicates {event.duplicateCount}{event.workflowRunId ? " · workflow run linked" : ""}</p></div>)}{events[webhook.id].length === 0 && <p className="text-xs text-slate-500">No deliveries retained.</p>}</div>}</article>)}{workspaceId && webhooks.length === 0 && <p className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">No webhook triggers in this workspace yet.</p>}</div>
    {message && <p role="status" className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">{message}</p>}{error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
  </section>;
}
