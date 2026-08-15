"use client";

import { InlineAlert } from "@/components/ui/inline-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/components/workspace/workspace-provider";

export function WorkspaceSwitcher() {
  const { error, isLoading, memberships, reload, selectWorkspace, selectedWorkspaceId } = useWorkspace();

  if (isLoading) return <Skeleton className="h-16 rounded-2xl" label="Loading workspaces" />;

  if (memberships.length === 0) {
    return <InlineAlert title="No workspace yet" tone="info">Create your first workspace from the Overview page.</InlineAlert>;
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400" htmlFor="workspace-switcher">Workspace</label>
      <select
        aria-label="Select workspace"
        className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        id="workspace-switcher"
        onChange={(event) => selectWorkspace(event.target.value)}
        value={selectedWorkspaceId ?? ""}
      >
        {memberships.map(({ role, workspace }) => <option key={workspace.id} value={workspace.id}>{workspace.name} · {role}</option>)}
      </select>
      {error ? <InlineAlert className="mt-2" tone="error" title="Workspace unavailable"><span className="flex flex-wrap items-center justify-between gap-2">{error}<button className="font-semibold underline underline-offset-2" onClick={() => void reload()} type="button">Retry</button></span></InlineAlert> : null}
    </div>
  );
}
