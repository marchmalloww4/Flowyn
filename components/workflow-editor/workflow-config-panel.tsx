"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WorkflowEditorNode } from "@/lib/workflows/editor";

export function WorkflowConfigPanel({ node, onUpdate }: { node: WorkflowEditorNode | null; onUpdate: (patch: Partial<Pick<WorkflowEditorNode, "name" | "config">>) => void }) {
  const [configText, setConfigText] = useState("{}");
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    setConfigText(node ? JSON.stringify(node.config, null, 2) : "{}");
    setConfigError(null);
  }, [node]);

  if (!node) return <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-800">Select a step to edit its name and server-validated configuration.</div>;

  function applyConfig() {
    try {
      const parsed: unknown = JSON.parse(configText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Configuration must be a JSON object.");
      onUpdate({ config: parsed as WorkflowEditorNode["config"] });
      setConfigError(null);
    } catch (cause) {
      setConfigError(cause instanceof Error ? cause.message : "Configuration must be valid JSON.");
    }
  }

  return <div className="space-y-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-800"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Selected step</p><p className="mt-1 text-sm font-semibold">{node.type.replace("_", " ")}</p></div><div className="space-y-2"><Label htmlFor="workflow-step-name">Name</Label><Input id="workflow-step-name" value={node.name} onChange={(event) => onUpdate({ name: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="workflow-step-config">Configuration JSON</Label><textarea id="workflow-step-config" value={configText} onChange={(event) => setConfigText(event.target.value)} className="min-h-48 w-full rounded-2xl border border-slate-200 bg-transparent px-3 py-2 font-mono text-xs outline-none focus:border-slate-950 dark:border-slate-700" spellCheck={false} /><Button type="button" size="sm" variant="outline" onClick={applyConfig}>Apply configuration</Button>{configError && <p role="alert" className="text-xs text-red-600">{configError}</p>}</div><p className="text-xs leading-5 text-slate-500">The server validates this configuration and all referenced agents/brands before creating an executable version.</p></div>;
}
