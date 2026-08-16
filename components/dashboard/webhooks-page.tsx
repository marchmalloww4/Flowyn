"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Copy, Webhook as WebhookIcon } from "lucide-react";
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
import { canManageWebhooks, filterWorkspaceWebhooks, type WebhookRecord } from "@/lib/client/webhooks-state";
import { formatWebhookEventStatus } from "@/lib/webhooks/ui";

type Workflow = { id: string; workspaceId: string; name: string; enabled: boolean };
type Webhook = WebhookRecord & { workflowId: string; publicId: string; endpointUrl?: string; secretVersion: number };
type WebhookEvent = { id: string; status: "TRIGGERED" | "SKIPPED" | "FAILED"; reasonCode: string | null; payloadBytes: number; workflowRunId: string | null; receivedAt: string; duplicateCount: number };

function safeError(error: unknown, fallback: string) { return error instanceof FlowynClientError ? error.details.message : fallback; }

function WebhookCard({ canManage, events, onDelete, onHistory, onRotate, onToggle, pending, webhook }: { canManage: boolean; events?: WebhookEvent[]; onDelete: (webhook: Webhook) => void; onHistory: (webhook: Webhook) => void; onRotate: (webhook: Webhook) => void; onToggle: (webhook: Webhook) => void; pending: boolean; webhook: Webhook }) {
  return <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950"><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><WebhookIcon aria-hidden className="mt-0.5 h-5 w-5 text-violet-600" /><div><h2 className="font-semibold">{webhook.name}</h2><p className="mt-1 break-all font-mono text-xs text-slate-500">{webhook.endpointUrl ?? `/api/hooks/${webhook.publicId}`}</p><p className="mt-1 text-xs text-slate-400">Secret version {webhook.secretVersion}</p></div></div><StatusBadge tone={webhook.enabled ? "success" : "neutral"}>{webhook.enabled ? "Enabled" : "Disabled"}</StatusBadge></div><div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => onHistory(webhook)} size="sm" variant="outline">Delivery history</Button>{canManage ? <><Button disabled={pending} onClick={() => onToggle(webhook)} size="sm" variant="outline">{webhook.enabled ? "Disable" : "Enable"}</Button><Button disabled={pending} onClick={() => onRotate(webhook)} size="sm" variant="outline">Rotate secret</Button><Button disabled={pending} onClick={() => onDelete(webhook)} size="sm" variant="outline">Delete</Button></> : null}</div>{events ? <div className="mt-4 space-y-2 border-t pt-4">{events.length === 0 ? <p className="text-xs text-slate-500">No deliveries retained.</p> : events.map((event) => <div className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-900" key={event.id}><div className="flex flex-wrap justify-between gap-3"><span className="font-semibold">{formatWebhookEventStatus(event.status, event.reasonCode)}</span><span className="text-slate-500">{new Date(event.receivedAt).toLocaleString()}</span></div><p className="mt-1 text-slate-500">{event.payloadBytes} bytes · duplicates {event.duplicateCount}{event.workflowRunId ? " · workflow run linked" : ""}</p></div>)}</div> : null}</article>;
}

export function WebhooksPage() {
  const { selectedMembership, selectedWorkspace, selectedWorkspaceId } = useWorkspace();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [events, setEvents] = useState<Record<string, WebhookEvent[]>>({});
  const [workflowId, setWorkflowId] = useState("");
  const [name, setName] = useState("Inbound workflow trigger");
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Webhook | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManage = canManageWebhooks(selectedMembership?.role);

  useEffect(() => {
    const controller = new AbortController();
    setWorkflows([]); setWebhooks([]); setEvents({}); setWorkflowId(""); setOneTimeSecret(null); setMessage(null); setError(null);
    if (!selectedWorkspaceId) return () => controller.abort();
    setLoading(true);
    void Promise.all([
      apiRequest<{ workflows: Workflow[] }>(`/api/workflows?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`, { cache: "no-store", signal: controller.signal }),
      apiRequest<{ webhooks: Webhook[] }>(`/api/workflow-webhooks?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`, { cache: "no-store", signal: controller.signal }),
    ]).then(([workflowBody, webhookBody]) => {
      setWorkflows(workflowBody.workflows.filter((workflow) => workflow.workspaceId === selectedWorkspaceId));
      setWebhooks(filterWorkspaceWebhooks(webhookBody.webhooks, selectedWorkspaceId) as Webhook[]);
      setWorkflowId(workflowBody.workflows.find((workflow) => workflow.enabled)?.id ?? workflowBody.workflows[0]?.id ?? "");
    }).catch((caughtError: unknown) => { if (!controller.signal.aborted) setError(safeError(caughtError, "Webhooks could not be loaded.")); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedWorkspaceId]);

  async function refresh() { if (!selectedWorkspaceId) return; const body = await apiRequest<{ webhooks: Webhook[] }>(`/api/workflow-webhooks?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`, { cache: "no-store" }); setWebhooks(filterWorkspaceWebhooks(body.webhooks, selectedWorkspaceId) as Webhook[]); }
  async function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!selectedWorkspaceId || !workflowId || !canManage) return; setPending(true); setError(null); setOneTimeSecret(null); try { const body = await apiRequest<{ trigger: Webhook; secret: string }>("/api/workflow-webhooks", { body: JSON.stringify({ name, workflowId, workspaceId: selectedWorkspaceId }), headers: { "content-type": "application/json" }, method: "POST" }); setOneTimeSecret(body.secret); await refresh(); setMessage("Webhook created. Copy the secret now; it will not be shown again."); } catch (caughtError) { setError(safeError(caughtError, "Webhook could not be created.")); } finally { setPending(false); } }
  async function toggle(webhook: Webhook) { setPending(true); try { await apiRequest(`/api/workflow-webhooks/${encodeURIComponent(webhook.id)}/${webhook.enabled ? "disable" : "enable"}`, { method: "POST" }); await refresh(); setMessage(webhook.enabled ? "Webhook disabled." : "Webhook enabled."); } catch (caughtError) { setError(safeError(caughtError, "Webhook could not be updated.")); } finally { setPending(false); } }
  async function rotate(webhook: Webhook) { setPending(true); setOneTimeSecret(null); try { const body = await apiRequest<{ secret: string }>(`/api/workflow-webhooks/${encodeURIComponent(webhook.id)}/rotate-secret`, { method: "POST" }); setOneTimeSecret(body.secret); await refresh(); setMessage("Secret rotated. Copy the new secret now; the old secret is revoked."); } catch (caughtError) { setError(safeError(caughtError, "Webhook secret could not be rotated.")); } finally { setPending(false); } }
  async function remove() { if (!deleteTarget) return; setPending(true); try { await apiRequest(`/api/workflow-webhooks/${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" }); setDeleteTarget(null); await refresh(); setMessage("Webhook deleted."); } catch (caughtError) { setError(safeError(caughtError, "Webhook could not be deleted.")); } finally { setPending(false); } }
  async function showEvents(webhook: Webhook) { try { const body = await apiRequest<{ events: WebhookEvent[] }>(`/api/workflow-webhooks/${encodeURIComponent(webhook.id)}/events?limit=50`, { cache: "no-store" }); setEvents((current) => ({ ...current, [webhook.id]: body.events })); } catch (caughtError) { setError(safeError(caughtError, "Webhook history could not be loaded.")); } }

  return (
    <div className="space-y-8">
      <header><p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-600">Webhooks</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">Receive signed workflow triggers.</h1><p className="mt-3 max-w-2xl text-slate-500">Inbound webhooks stay narrowly scoped, secret-backed, deduplicated, and connected only to selected durable workflows.</p><p className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">Advanced: external trigger</p></header>
      {message ? <InlineAlert tone="success">{message}</InlineAlert> : null}
      {error ? <InlineAlert title="Webhook operation unavailable" tone="error">{error}</InlineAlert> : null}
      {oneTimeSecret ? <InlineAlert tone="warning" title="One-time secret"><span className="block">Copy this now. Flowyn stores only an encrypted form and cannot recover it.</span><code className="mt-3 block overflow-x-auto rounded-xl bg-white p-3 text-xs text-slate-900">{oneTimeSecret}</code><Button className="mt-3" onClick={() => void navigator.clipboard?.writeText(oneTimeSecret)} size="sm" type="button" variant="outline"><Copy aria-hidden className="h-4 w-4" />Copy secret</Button></InlineAlert> : null}
      {!selectedWorkspace ? <EmptyState title="Select a workspace first" description="Webhook triggers are workspace-scoped and server-authorized." /> : <>
        {canManage ? <form className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950" onSubmit={(event) => void create(event)}><h2 className="text-lg font-semibold">Start this workflow from another app</h2><p className="mt-1 text-sm text-slate-500">An inbound trigger lets another system securely start this workflow, for example by sending a webhook.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><FormField description="Use a name your team will recognize in delivery history." htmlFor="webhook-name" label="Trigger name"><Input id="webhook-name" onChange={(event) => setName(event.target.value)} required value={name} /></FormField><div className="space-y-2"><label className="block text-sm font-medium" htmlFor="webhook-workflow">Workflow</label><select className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm" id="webhook-workflow" onChange={(event) => setWorkflowId(event.target.value)} value={workflowId}><option value="">Select workflow</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}{workflow.enabled ? "" : " (disabled)"}</option>)}</select></div></div><Button className="mt-5" disabled={pending || !workflowId} type="submit">Create webhook</Button></form> : <InlineAlert tone="info" title="Read-only webhook role">Members can inspect signed trigger status and delivery history. Secret changes remain management actions.</InlineAlert>}
        {loading ? <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-40" label="Loading webhook" /><Skeleton className="h-40" label="Loading webhook" /></div> : webhooks.length === 0 ? <EmptyState title="No webhook triggers yet" description={canManage ? "Create a signed inbound trigger when another app needs to start a workflow." : "A workspace administrator can create a webhook trigger."} /> : <div className="space-y-4">{webhooks.map((webhook) => <WebhookCard canManage={canManage} events={events[webhook.id]} key={webhook.id} onDelete={setDeleteTarget} onHistory={(value) => void showEvents(value)} onRotate={(value) => void rotate(value)} onToggle={(value) => void toggle(value)} pending={pending} webhook={webhook} />)}</div>}
      </>}
      {deleteTarget ? <ConfirmDialog confirmLabel="Delete webhook" description="Delete this trigger? Retained delivery history is governed by existing server retention." onCancel={() => setDeleteTarget(null)} onConfirm={() => void remove()} open pending={pending} title="Delete webhook" destructive /> : null}
    </div>
  );
}
