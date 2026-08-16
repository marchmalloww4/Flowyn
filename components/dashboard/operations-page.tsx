"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { UsageSummary, type UsageSummaryData } from "@/components/forms/usage-summary";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, FlowynClientError } from "@/lib/client/api";
import { operationStatusSummary } from "@/lib/client/operations-state";

type Operations = { workflowRuns: Record<string, number>; agentRuns: Record<string, number>; integrationActions: Record<string, number>; deferredDispatches: number };
function safeError(error: unknown, fallback: string) { return error instanceof FlowynClientError ? error.details.message : fallback; }

export function OperationsPage() {
  const { selectedWorkspace, selectedWorkspaceId } = useWorkspace();
  const [usage, setUsage] = useState<UsageSummaryData | null>(null);
  const [operations, setOperations] = useState<Operations | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setUsage(null); setOperations(null); setError(null);
    if (!selectedWorkspaceId) return () => controller.abort();
    setLoading(true);
    void Promise.all([
      apiRequest<UsageSummaryData>(`/api/workspaces/${encodeURIComponent(selectedWorkspaceId)}/usage`, { cache: "no-store", signal: controller.signal }),
      apiRequest<Operations>(`/api/workspaces/${encodeURIComponent(selectedWorkspaceId)}/operations?limit=50`, { cache: "no-store", signal: controller.signal }),
    ]).then(([usageBody, operationsBody]) => { setUsage(usageBody); setOperations(operationsBody); }).catch((caughtError: unknown) => { if (!controller.signal.aborted) setError(safeError(caughtError, "Workspace operations could not be loaded.")); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedWorkspaceId]);

  return <div className="space-y-8"><header><p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-600">Usage / Operations</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">See how the workspace is running.</h1><p className="mt-3 max-w-2xl text-slate-500">Durable counters and safe projections help you understand activity without exposing provider payloads, credentials, or raw logs.</p></header>{error ? <InlineAlert title="Operations unavailable" tone="error">{error}</InlineAlert> : null}{!selectedWorkspace ? <EmptyState title="Select a workspace first" description="Usage and operations are isolated by workspace." /> : loading ? <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-56" label="Loading usage" /><Skeleton className="h-56" label="Loading operations" /></div> : usage && operations ? <><UsageSummary usage={usage} /><Card aria-label="Recent workspace operations"><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><Activity aria-hidden className="mt-0.5 h-5 w-5 text-violet-600" /><div><h2 className="font-semibold">Recent durable projections</h2><p className="mt-1 text-sm text-slate-500">Status counts only; individual payloads remain outside the browser surface.</p></div></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">Deferred: {operations.deferredDispatches}</span></div><div className="mt-5 grid gap-4 md:grid-cols-3"><div className="rounded-2xl border border-slate-100 p-4 dark:border-slate-800"><p className="text-xs font-medium text-slate-500">Workflows</p><p className="mt-2 text-sm">{operationStatusSummary(operations.workflowRuns)}</p></div><div className="rounded-2xl border border-slate-100 p-4 dark:border-slate-800"><p className="text-xs font-medium text-slate-500">Agents</p><p className="mt-2 text-sm">{operationStatusSummary(operations.agentRuns)}</p></div><div className="rounded-2xl border border-slate-100 p-4 dark:border-slate-800"><p className="text-xs font-medium text-slate-500">Integrations</p><p className="mt-2 text-sm">{operationStatusSummary(operations.integrationActions)}</p></div></div></Card></> : <EmptyState title="No operations summary" description="A safe summary will appear when the workspace has durable activity. Review these projections to understand what Flowyn has run without opening raw payloads." />}</div>;
}
