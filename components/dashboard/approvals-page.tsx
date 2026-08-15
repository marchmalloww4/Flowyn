"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiRequest, FlowynClientError } from "@/lib/client/api";
import { approvalStatusLabel, canDecideApprovals, filterWorkspaceApprovals, type ApprovalRecord } from "@/lib/client/approvals-state";

type Approval = ApprovalRecord & { workflowRunId: string; workflowVersion: number; requiredRole: "OWNER" | "ADMIN"; safeContext: { origin?: "manual" | "schedule" | "webhook"; completedStepCount?: number }; createdAt: string; expiresAt: string | null; decidedAt: string | null };
function safeError(error: unknown, fallback: string) { return error instanceof FlowynClientError ? error.details.message : fallback; }
function date(value: string | null) { return value ? new Date(value).toLocaleString() : "No expiry"; }

export function ApprovalsPage() {
  const { selectedMembership, selectedWorkspace, selectedWorkspaceId } = useWorkspace();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ approval: Approval; action: "approve" | "reject" } | null>(null);
  const canDecide = canDecideApprovals(selectedMembership?.role);

  useEffect(() => {
    const controller = new AbortController();
    setApprovals([]); setError(null); setMessage(null);
    if (!selectedWorkspaceId) return () => controller.abort();
    setLoading(true);
    void apiRequest<{ approvals: Approval[] }>(`/api/workflow-approvals?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`, { cache: "no-store", signal: controller.signal })
      .then((body) => setApprovals(filterWorkspaceApprovals(body.approvals, selectedWorkspaceId) as Approval[]))
      .catch((caughtError: unknown) => { if (!controller.signal.aborted) setError(safeError(caughtError, "Approval inbox could not be loaded.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedWorkspaceId]);

  async function refresh() { if (!selectedWorkspaceId) return; const body = await apiRequest<{ approvals: Approval[] }>(`/api/workflow-approvals?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`, { cache: "no-store" }); setApprovals(filterWorkspaceApprovals(body.approvals, selectedWorkspaceId) as Approval[]); }
  async function decide() {
    if (!decision) return;
    setPendingId(decision.approval.id); setError(null);
    try { await apiRequest(`/api/workflow-approvals/${encodeURIComponent(decision.approval.id)}/${decision.action}`, { body: JSON.stringify({}), headers: { "content-type": "application/json" }, method: "POST" }); setDecision(null); await refresh(); setMessage(`Approval ${decision.action === "approve" ? "approved" : "rejected"}.`); }
    catch (caughtError) { setError(safeError(caughtError, "Approval decision could not be completed.")); } finally { setPendingId(null); }
  }

  return (
    <div className="space-y-8">
      <header><p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-600">Approvals</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">Review human gates.</h1><p className="mt-3 max-w-2xl text-slate-500">Only authenticated users with the existing workspace action are shown decision controls. Approval state remains durable and human-only.</p></header>
      {message ? <InlineAlert tone="success">{message}</InlineAlert> : null}
      {error ? <InlineAlert title="Approval operation unavailable" tone="error">{error}</InlineAlert> : null}
      {!selectedWorkspace ? <EmptyState title="Select a workspace first" description="Approval requests are always isolated by workspace." /> : <>
        {!canDecide ? <InlineAlert tone="info" title="Read-only approval role">Members can inspect pending gates. OWNER and ADMIN decisions remain enforced by the server.</InlineAlert> : null}
        {loading ? <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-40" label="Loading approval" /><Skeleton className="h-40" label="Loading approval" /></div> : approvals.length === 0 ? <EmptyState title="No approval requests" description="Durable workflow gates waiting for this workspace will appear here." /> : <div className="space-y-4">{approvals.map((approval) => <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950" key={approval.id}><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 text-violet-600" /><div><h2 className="font-semibold">{approval.workflowName} · {approval.workflowStepName}</h2><p className="mt-1 text-xs text-slate-500">Run {approval.workflowRunId} · version {approval.workflowVersion} · requires {approval.requiredRole}</p></div></div><StatusBadge tone={approval.status === "PENDING" ? "warning" : approval.status === "APPROVED" ? "success" : approval.status === "REJECTED" ? "danger" : "neutral"}>{approvalStatusLabel(approval.status)}</StatusBadge></div><div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-3"><span>Origin: {approval.safeContext.origin ?? "manual"}</span><span>Created: {date(approval.createdAt)}</span><span>Expires: {date(approval.expiresAt)}</span></div>{approval.status === "PENDING" && canDecide ? <div className="mt-4 flex flex-wrap gap-2"><Button disabled={pendingId === approval.id} onClick={() => setDecision({ action: "approve", approval })}>Approve</Button><Button disabled={pendingId === approval.id} onClick={() => setDecision({ action: "reject", approval })} variant="outline">Reject</Button></div> : null}</article>)}</div>}
      </>}
      {decision ? <ConfirmDialog confirmLabel={decision.action === "approve" ? "Approve gate" : "Reject gate"} description={`Confirm this human decision for ${decision.approval.workflowName} · ${decision.approval.workflowStepName}.`} onCancel={() => setDecision(null)} onConfirm={() => void decide()} open pending={pendingId === decision.approval.id} title={decision.action === "approve" ? "Approve workflow gate" : "Reject workflow gate"} destructive={decision.action === "reject"} /> : null}
    </div>
  );
}
