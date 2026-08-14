"use client";

import React from "react";

export interface UsageSummaryData {
  plan: string;
  limits: Record<string, number>;
  counters: Record<string, number>;
  concurrency: Record<string, number>;
  rateLimit: { status: "degraded"; note: string };
}

const labels: Record<string, string> = {
  aiGenerationsPerDay: "AI generations per day",
  aiGenerationsPerMinute: "AI generations per minute",
  agentRunsPerDay: "Agent runs per day",
  concurrentAgents: "Concurrent agents",
  workflowStartsPerDay: "Workflow starts per day",
  workflowStartsPerMinute: "Workflow starts per minute",
  concurrentWorkflows: "Concurrent workflows",
  acceptedWebhooksPerMinute: "Accepted webhooks per minute",
  activeSchedules: "Active schedules",
  knowledgeDocuments: "Knowledge documents",
  knowledgeCharacters: "Knowledge characters",
  integrationCredentials: "Integration credentials",
  concurrentIntegrationActions: "Concurrent integration actions",
  integrationActionsPerDay: "Integration actions per day",
  integrationActionsPerMinute: "Integration actions per minute",
};

const dailyMetricByLimit: Record<string, string> = {
  aiGenerationsPerDay: "AI_GENERATION_DAY:day",
  agentRunsPerDay: "AGENT_RUN_DAY:day",
  workflowStartsPerDay: "WORKFLOW_START_DAY:day",
  integrationActionsPerDay: "INTEGRATION_ACTION_DAY:day",
};

function labelFor(key: string): string {
  return labels[key] ?? key.replaceAll(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase());
}

export function UsageSummary({ usage }: { usage: UsageSummaryData }) {
  return <section aria-label="Workspace usage" className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold">Workspace usage</p><p className="mt-1 text-sm text-slate-500">Plan limits and current durable counters.</p></div><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-200">{usage.plan}</span></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(usage.limits).map(([key, limit]) => { const consumed = usage.counters[dailyMetricByLimit[key] ?? ""] ?? 0; const percent = limit > 0 ? Math.min(100, Math.round((consumed / limit) * 100)) : 0; return <div key={key} className="rounded-2xl border border-slate-100 p-4 dark:border-slate-800"><div className="flex items-start justify-between gap-3"><p className="text-xs font-medium text-slate-500">{labelFor(key)}</p><p className="text-xs font-semibold">{consumed}/{limit}</p></div><div className="mt-3 h-2 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-2 rounded-full bg-violet-500" style={{ width: `${percent}%` }} /></div></div>; })}</div><div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-900"><p className="font-medium">Active concurrency</p><p className="mt-1 text-slate-500">Agents: {usage.concurrency.AGENT ?? 0} · Workflows: {usage.concurrency.WORKFLOW ?? 0} · Integrations: {usage.concurrency.INTEGRATION ?? 0}</p><p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{usage.rateLimit.note}</p></div></section>;
}
