import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { OnboardingState } from "@/lib/client/onboarding-state";

const destinationByStage = {
  workspace: "/dashboard/brands",
  brand: "/dashboard/brands",
  knowledge: "/dashboard/knowledge",
  automation: "/dashboard/agents",
} as const;

export function OnboardingChecklist({ state, onResume, onSkip }: { state: OnboardingState; onResume: () => void; onSkip: () => void }) {
  if (state.completed) {
    return (
      <Card aria-label="Onboarding complete" className="border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20">
        <div className="flex items-start gap-3">
          <CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <h2 className="font-semibold">Your workspace is ready</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">The core setup is complete. Keep building from the workspace sections below.</p>
          </div>
        </div>
      </Card>
    );
  }

  if (!state.visible) {
    return (
      <Card aria-label="Onboarding paused">
        <h2 className="font-semibold">Setup checklist paused</h2>
        <p className="mt-1 text-sm text-slate-500">Your progress is still derived from the workspace. Resume whenever you want to continue.</p>
        <Button className="mt-4" onClick={onResume} variant="outline">Resume setup</Button>
      </Card>
    );
  }

  const currentStage = state.stages.find((stage) => stage.status === "CURRENT");

  return (
    <Card aria-label="Workspace setup checklist">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-violet-600">Getting started</p>
          <h2 className="mt-2 text-xl font-semibold">Set up your workspace in four steps</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">Flowyn checks your existing workspace resources and keeps this guidance current.</p>
        </div>
        <Button aria-label="Skip setup checklist" onClick={onSkip} size="sm" variant="ghost">Skip for now</Button>
      </div>
      <ol className="mt-6 grid gap-3 md:grid-cols-2">
        {state.stages.map((stage, index) => {
          const complete = stage.status === "COMPLETE";
          const current = stage.status === "CURRENT";
          return (
            <li className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800" key={stage.key}>
              <div className="flex items-start gap-3">
                {complete ? <CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <Circle aria-hidden className={current ? "mt-0.5 h-5 w-5 shrink-0 text-violet-600" : "mt-0.5 h-5 w-5 shrink-0 text-slate-300"} />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{index + 1}. {stage.label}</h3>
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{complete ? "Complete" : current ? "Current step" : "Upcoming"}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{stage.description}</p>
                  {current ? <Link className={`${buttonVariants({ size: "sm" })} mt-3`} href={destinationByStage[stage.key] as Route}>Continue <ArrowRight aria-hidden className="h-4 w-4" /></Link> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {currentStage ? <p className="mt-4 text-xs text-slate-500">Next: {currentStage.label}</p> : null}
    </Card>
  );
}
