"use client";

import { Button } from "@/components/ui/button";

export function WorkflowJsonEditor({ value, onChange, onApply, error }: { value: string; onChange: (value: string) => void; onApply: () => void; error: string | null }) {
  return <div className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Advanced definition JSON</p><p className="mt-1 text-xs leading-5 text-slate-500">This is the same executable definition used by the canvas. Layout and viewport metadata are saved separately.</p></div><textarea aria-label="Advanced workflow definition" value={value} onChange={(event) => onChange(event.target.value)} className="min-h-[520px] w-full rounded-2xl border border-slate-200 bg-transparent px-3 py-2 font-mono text-xs outline-none focus:border-slate-950 dark:border-slate-700" spellCheck={false} /><Button type="button" variant="outline" onClick={onApply}>Apply JSON to canvas</Button>{error && <p role="alert" className="text-xs text-red-600">{error}</p>}</div>;
}
