"use client";

import { useEffect, useState } from "react";
import { UsageSummary, type UsageSummaryData } from "@/components/forms/usage-summary";

interface OperationsSummaryData {
  workflowRuns: Record<string, number>;
  agentRuns: Record<string, number>;
  integrationActions: Record<string, number>;
  deferredDispatches: number;
}

function isUsageSummary(value: unknown): value is UsageSummaryData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<UsageSummaryData>;
  return typeof candidate.plan === "string" && !!candidate.limits && typeof candidate.limits === "object" && !!candidate.counters && typeof candidate.counters === "object" && !!candidate.concurrency && typeof candidate.concurrency === "object" && !!candidate.rateLimit && typeof candidate.rateLimit.note === "string";
}

function isOperationsSummary(value: unknown): value is OperationsSummaryData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OperationsSummaryData>;
  return !!candidate.workflowRuns && !!candidate.agentRuns && !!candidate.integrationActions && typeof candidate.deferredDispatches === "number";
}

async function readJson(response: Response): Promise<unknown> {
  const body: unknown = await response.json();
  if (!response.ok) throw new Error("Workspace operations are not available.");
  return body;
}

function statusCount(value: Record<string, number>): string {
  return Object.entries(value).map(([status, count]) => `${status}: ${count}`).join(" · ") || "None";
}

export function OperationsPanel({ workspaceId }: { workspaceId: string }) {
  const [usage, setUsage] = useState<UsageSummaryData | null>(null);
  const [operations, setOperations] = useState<OperationsSummaryData | null>(null);
  const [message, setMessage] = useState("Loading workspace operations…");

  useEffect(() => {
    const controller = new AbortController();
    setUsage(null); setOperations(null); setMessage("Loading workspace operations…");
    void Promise.all([
      fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/usage`, { cache: "no-store", signal: controller.signal }).then(readJson),
      fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/operations?limit=20`, { cache: "no-store", signal: controller.signal }).then(readJson),
    ]).then(([usageBody, operationsBody]) => {
      if (!isUsageSummary(usageBody) || !isOperationsSummary(operationsBody)) throw new Error("Workspace operations are not available.");
      setUsage(usageBody); setOperations(operationsBody); setMessage("");
    }).catch((error: unknown) => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Workspace operations are not available."); });
    return () => controller.abort();
  }, [workspaceId]);

  if (!usage || !operations) return <section aria-label="Workspace operations" className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950"><p>{message}</p></section>;
  return <div className="space-y-6"><UsageSummary usage={usage} /><section aria-label="Recent workspace operations" className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold">Operations</p><p className="mt-1 text-sm text-slate-500">Safe status projections for the selected workspace.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">Deferred: {operations.deferredDispatches}</span></div><div className="mt-5 grid gap-3 md:grid-cols-3"><div className="rounded-2xl border border-slate-100 p-4 dark:border-slate-800"><p className="text-xs font-medium text-slate-500">Workflows</p><p className="mt-2 text-sm">{statusCount(operations.workflowRuns)}</p></div><div className="rounded-2xl border border-slate-100 p-4 dark:border-slate-800"><p className="text-xs font-medium text-slate-500">Agents</p><p className="mt-2 text-sm">{statusCount(operations.agentRuns)}</p></div><div className="rounded-2xl border border-slate-100 p-4 dark:border-slate-800"><p className="text-xs font-medium text-slate-500">Integrations</p><p className="mt-2 text-sm">{statusCount(operations.integrationActions)}</p></div></div></section></div>;
}
