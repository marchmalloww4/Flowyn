"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Workspace = { id: string; name: string; slug: string };
type Brand = { id: string; name: string; description: string | null; tone: string | null };
type ErrorResponse = { error?: { message?: string } };
type StreamEvent = { text?: string; error?: { message?: string } };

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as T & ErrorResponse;
  if (!response.ok) throw new Error(body.error?.message ?? "Request failed.");
  return body;
}

export function AIGenerationPanel() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void (async () => {
      const body = await readResponse<{ workspaces: Array<{ workspace: Workspace }> }>(await fetch("/api/workspaces", { cache: "no-store" }));
      const next = body.workspaces.map((entry) => entry.workspace);
      setWorkspaces(next);
      setSelectedWorkspace((current) => current || next[0]?.id || "");
    })().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load workspaces."));
  }, []);

  useEffect(() => {
    setSelectedBrand("");
    if (!selectedWorkspace) {
      setBrands([]);
      return;
    }
    void (async () => {
      const body = await readResponse<{ brands: Brand[] }>(await fetch(`/api/brands?workspaceId=${encodeURIComponent(selectedWorkspace)}`, { cache: "no-store" }));
      setBrands(body.brands);
    })().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load brands."));
  }, [selectedWorkspace]);

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWorkspace) {
      setError("Select a workspace before generating.");
      return;
    }
    setPending(true);
    setError(null);
    setResult("");
    try {
      const response = await fetch("/api/ai/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: selectedWorkspace, brandId: selectedBrand || undefined, prompt, stream: true }) });
      if (!response.ok) {
        const body = await response.json() as ErrorResponse;
        throw new Error(body.error?.message ?? "Generation failed.");
      }
      if (!response.body) throw new Error("The AI stream was unavailable.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let output = "";
      let finished = false;
      while (!finished) {
        const next = await reader.read();
        buffer += decoder.decode(next.value ?? new Uint8Array(), { stream: !next.done });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? "";
        for (const rawEvent of events) {
          const dataLine = rawEvent.split(/\r?\n/).find((line) => line.startsWith("data: "));
          if (!dataLine) continue;
          const payload = dataLine.slice(6);
          if (payload === "[DONE]") {
            finished = true;
            break;
          }
          const streamEvent = JSON.parse(payload) as StreamEvent;
          if (streamEvent.error) throw new Error(streamEvent.error.message ?? "Generation failed.");
          output += streamEvent.text ?? "";
          setResult(output);
        }
        if (next.done) finished = true;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Generation failed.");
      setResult(null);
    } finally {
      setPending(false);
    }
  }

  return <section className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white dark:border-slate-800"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold">Local AI generation</p><p className="mt-1 text-sm text-slate-400">A real streamed request to your configured Ollama model.</p></div><span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">Ollama</span></div><form onSubmit={generate} className="mt-5 space-y-3"><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="ai-workspace" className="text-slate-300">Workspace</Label><select id="ai-workspace" value={selectedWorkspace} onChange={(event) => setSelectedWorkspace(event.target.value)} className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-violet-400"><option value="" className="text-slate-950">Select workspace</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id} className="text-slate-950">{workspace.name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="ai-brand" className="text-slate-300">Brand context <span className="font-normal text-slate-500">(optional)</span></Label><select id="ai-brand" value={selectedBrand} onChange={(event) => setSelectedBrand(event.target.value)} disabled={!selectedWorkspace} className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-violet-400"><option value="" className="text-slate-950">No brand context</option>{brands.map((brand) => <option key={brand.id} value={brand.id} className="text-slate-950">{brand.name}</option>)}</select></div></div><Label htmlFor="ai-prompt" className="text-slate-300">Prompt</Label><textarea id="ai-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe a short welcome message for a new customer…" className="min-h-28 w-full resize-y rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400" required /><Button type="submit" disabled={pending || !selectedWorkspace} className="bg-white text-slate-950 hover:bg-slate-200">{pending ? "Streaming…" : "Generate with Ollama"}</Button></form>{error && <p role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">{error}</p>}{result !== null && <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Provider output</p><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-100">{result || "Waiting for provider output…"}</p></div>}</section>;
}
