"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Workspace = { id: string; name: string; role: "OWNER" | "ADMIN" | "MEMBER" };
type Approval = {
  id: string;
  workspaceId: string;
  workflowRunId: string;
  workflowStepId: string;
  workflowName: string;
  workflowStepName: string;
  workflowVersion: number;
  requiredRole: "OWNER" | "ADMIN";
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "CANCELLED";
  safeContext: { origin?: "manual" | "schedule" | "webhook"; completedStepCount?: number };
  createdAt: string;
  expiresAt: string | null;
  decidedAt: string | null;
};
type ErrorBody = { error?: { message?: string } };

async function responseBody<T>(response: Response): Promise<T> {
  const body = await response.json() as T & ErrorBody;
  if (!response.ok) throw new Error((body as ErrorBody).error?.message ?? "Request failed.");
  return body as T;
}

function date(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "No expiry";
}

export function ApprovalPanel() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
  const canDecide = selectedWorkspace?.role === "OWNER" || selectedWorkspace?.role === "ADMIN";

  async function loadApprovals(nextWorkspaceId: string) {
    if (!nextWorkspaceId) return setApprovals([]);
    const body = await responseBody<{ approvals: Approval[] }>(await fetch(`/api/workflow-approvals?workspaceId=${encodeURIComponent(nextWorkspaceId)}`, { cache: "no-store" }));
    setApprovals(body.approvals);
  }

  useEffect(() => {
    void (async () => {
      const body = await responseBody<{ workspaces: Array<{ workspace: Omit<Workspace, "role">; role: Workspace["role"] }> }>(await fetch("/api/workspaces", { cache: "no-store" }));
      const next = body.workspaces.map((entry) => ({ ...entry.workspace, role: entry.role }));
      setWorkspaces(next);
      setWorkspaceId(next[0]?.id ?? "");
    })().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load approval workspaces."));
  }, []);

  useEffect(() => {
    void loadApprovals(workspaceId).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load approvals."));
  }, [workspaceId]);

  async function decide(approval: Approval, action: "approve" | "reject") {
    setBusyId(approval.id);
    setError(null);
    try {
      await responseBody<{ approval: Approval }>(await fetch(`/api/workflow-approvals/${approval.id}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
      await loadApprovals(workspaceId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not decide approval.");
    } finally {
      setBusyId(null);
    }
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm font-semibold uppercase tracking-[0.14em] text-violet-600">Human approval inbox</p><h2 className="mt-2 text-2xl font-semibold">Review waiting workflow gates</h2><p className="mt-2 max-w-2xl text-sm text-slate-500">Only authenticated workspace members can view requests. Decisions use the stored workflow policy and never trust client roles.</p></div>
      <select aria-label="Approval workspace" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}><option value="">Select workspace</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name} ({workspace.role})</option>)}</select>
    </div>
    {error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <div className="mt-5 space-y-3">{approvals.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-900">No approval requests for this workspace.</p> : approvals.map((approval) => <article key={approval.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{approval.workflowName} · {approval.workflowStepName}</h3><p className="mt-1 text-xs text-slate-500">Run {approval.workflowRunId} · version {approval.workflowVersion} · requires {approval.requiredRole}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${approval.status === "PENDING" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{approval.status}</span></div><div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-3"><span>Origin: {approval.safeContext.origin ?? "manual"}</span><span>Created: {date(approval.createdAt)}</span><span>Expires: {date(approval.expiresAt)}</span></div>{approval.status === "PENDING" && canDecide && <div className="mt-4 flex gap-2"><Button disabled={busyId === approval.id} onClick={() => void decide(approval, "approve")}>Approve</Button><Button variant="outline" disabled={busyId === approval.id} onClick={() => void decide(approval, "reject")}>Reject</Button></div>}</article>)}</div>
  </section>;
}
