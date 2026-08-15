"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Gauge } from "lucide-react";
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { apiRequest, FlowynClientError } from "@/lib/client/api";
import { deriveOnboardingState, type OnboardingSnapshot } from "@/lib/client/onboarding-state";
import type { UsageSummaryData } from "@/components/forms/usage-summary";

const DISMISSAL_KEY = "flowyn.onboarding.dismissed.v1";

type Brand = { id: string; name: string };
type KnowledgeDocument = { status: string };
type Agent = { enabled: boolean };
type Workflow = { enabled: boolean };

type OverviewData = {
  snapshot: OnboardingSnapshot;
  usage: UsageSummaryData | null;
};

function CompactOperationsSummary({ usage }: { usage: UsageSummaryData | null }) {
  if (!usage) {
    return <Card aria-label="Workspace operations"><div className="flex items-start gap-3"><Gauge aria-hidden className="mt-0.5 h-5 w-5 text-violet-600" /><div><h2 className="font-semibold">Usage and operations</h2><p className="mt-1 text-sm text-slate-500">Operational summaries will appear when this workspace has usage data.</p></div></div><Link className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-4`} href={"/dashboard/operations" as Route}>Open operations <ArrowRight aria-hidden className="h-4 w-4" /></Link></Card>;
  }

  const dailyCounters = Object.entries(usage.counters).filter(([key]) => key.endsWith(":day"));
  return (
    <Card aria-label="Workspace operations">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3"><Gauge aria-hidden className="mt-0.5 h-5 w-5 text-violet-600" /><div><h2 className="font-semibold">Usage and operations</h2><p className="mt-1 text-sm text-slate-500">Safe durable counters for the selected workspace.</p></div></div>
        <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-200">{usage.plan}</span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {(dailyCounters.length > 0 ? dailyCounters.slice(0, 2) : [["active", 0] as const]).map(([key, value]) => <div className="rounded-2xl border border-slate-100 p-4 dark:border-slate-800" key={key}><p className="text-xs font-medium text-slate-500">{key.replaceAll("_", " ")}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>)}
      </div>
      <Link className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-4`} href={"/dashboard/operations" as Route}>Review operations <ArrowRight aria-hidden className="h-4 w-4" /></Link>
    </Card>
  );
}

export function OverviewPage() {
  const { beginWorkspaceRequest, isCurrentWorkspaceRequest, memberships, selectedWorkspace, selectedWorkspaceId, workspaceEpoch } = useWorkspace();
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const onboarding = useMemo(() => data ? deriveOnboardingState(data.snapshot, { dismissed }) : null, [data, dismissed]);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISSAL_KEY) === "true");
    } catch {
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    const request = beginWorkspaceRequest();
    const localController = new AbortController();
    setData(null);
    setError(null);

    async function loadOverview() {
      if (!selectedWorkspaceId) {
        if (isCurrentWorkspaceRequest(request.generation)) setData({ snapshot: { hasMembership: memberships.length > 0, hasBrand: false, knowledgeStatuses: [], hasUsableAgent: false, hasUsableWorkflow: false }, usage: null });
        return;
      }

      const workspaceQuery = encodeURIComponent(selectedWorkspaceId);
      const brandBody = await apiRequest<{ brands: Brand[] }>(`/api/brands?workspaceId=${workspaceQuery}`, { cache: "no-store", signal: localController.signal });
      const firstBrand = brandBody.brands[0];
      const knowledgeRequest = firstBrand
        ? apiRequest<{ documents: KnowledgeDocument[] }>(`/api/knowledge?workspaceId=${workspaceQuery}&brandId=${encodeURIComponent(firstBrand.id)}`, { cache: "no-store", signal: localController.signal })
        : Promise.resolve({ documents: [] });
      const [knowledgeBody, agentBody, workflowBody, usage] = await Promise.all([
        knowledgeRequest,
        apiRequest<{ agents: Agent[] }>(`/api/agents?workspaceId=${workspaceQuery}`, { cache: "no-store", signal: localController.signal }),
        apiRequest<{ workflows: Workflow[] }>(`/api/workflows?workspaceId=${workspaceQuery}`, { cache: "no-store", signal: localController.signal }),
        apiRequest<UsageSummaryData>(`/api/workspaces/${workspaceQuery}/usage`, { cache: "no-store", signal: localController.signal }).catch(() => null),
      ]);

      if (!isCurrentWorkspaceRequest(request.generation)) return;
      setData({
        snapshot: {
          hasMembership: true,
          hasBrand: brandBody.brands.length > 0,
          knowledgeStatuses: knowledgeBody.documents.map((document) => document.status),
          hasUsableAgent: agentBody.agents.some((agent) => agent.enabled),
          hasUsableWorkflow: workflowBody.workflows.some((workflow) => workflow.enabled),
        },
        usage,
      });
    }

    void loadOverview().catch((caughtError: unknown) => {
      if (localController.signal.aborted || (caughtError instanceof DOMException && caughtError.name === "AbortError")) return;
      if (caughtError instanceof FlowynClientError) setError(caughtError.details.message);
      else setError("Workspace overview could not be loaded. Try again.");
    });
    return () => localController.abort();
  }, [beginWorkspaceRequest, isCurrentWorkspaceRequest, memberships.length, selectedWorkspaceId, workspaceEpoch]);

  function skipSetup() {
    try { window.localStorage.setItem(DISMISSAL_KEY, "true"); } catch { /* Visibility preference is optional. */ }
    setDismissed(true);
  }

  function resumeSetup() {
    try { window.localStorage.removeItem(DISMISSAL_KEY); } catch { /* Visibility preference is optional. */ }
    setDismissed(false);
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-600">Workspace overview</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">Build your first AI workforce.</h1>
        <p className="mt-3 max-w-2xl text-slate-500">A focused starting point for workspace setup, brand context, knowledge, and safe automation.</p>
      </header>

      {error ? <InlineAlert title="Overview unavailable" tone="error">{error}</InlineAlert> : null}
      {!selectedWorkspaceId && memberships.length === 0 ? <EmptyState title="Create your first workspace" description="Workspaces keep brands, knowledge, runs, and operational data isolated." action={<Link className={buttonVariants()} href={"/dashboard/brands" as Route}>Create workspace <ArrowRight aria-hidden className="h-4 w-4" /></Link>} /> : null}
      {selectedWorkspace && data && onboarding ? <>
        <Card aria-label="Selected workspace" className="border-violet-100 dark:border-violet-950">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Selected workspace</p><h2 className="mt-2 text-2xl font-semibold">{selectedWorkspace.name}</h2><p className="mt-1 text-sm text-slate-500">/{selectedWorkspace.slug}</p></div><Link className={buttonVariants({ variant: "outline", size: "sm" })} href={"/dashboard/settings" as Route}>Workspace settings</Link></div>
        </Card>
        <OnboardingChecklist onResume={resumeSetup} onSkip={skipSetup} state={onboarding} />
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><h2 className="font-semibold">Brand context</h2><p className="mt-1 text-sm text-slate-500">Keep the selected workspace&apos;s brand profile ready for bounded AI and automation work.</p><Link className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-4`} href={"/dashboard/brands" as Route}>Manage brands <ArrowRight aria-hidden className="h-4 w-4" /></Link></Card>
          <CompactOperationsSummary usage={data.usage} />
        </div>
      </> : selectedWorkspaceId ? <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-36" label="Loading workspace summary" /><Skeleton className="h-36" label="Loading onboarding" /><Skeleton className="h-36" label="Loading operations" /></div> : null}
    </div>
  );
}
