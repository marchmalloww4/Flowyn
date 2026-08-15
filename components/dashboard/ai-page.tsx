"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { aiStreamStatus, isValidBrandSelection } from "@/lib/client/ai-state";
import { apiRequest, FlowynClientError, mapApiError } from "@/lib/client/api";

type Brand = { id: string; workspaceId: string; name: string; description: string | null };
type StreamEvent = { text?: unknown; error?: { code?: unknown } };

function safeStreamError(code: string) {
  return /PROVIDER|OLLAMA|MODEL|EMBEDDING/u.test(code) ? aiStreamStatus("provider") : aiStreamStatus("unknown");
}

export function AIPage() {
  const { selectedWorkspace, selectedWorkspaceId } = useWorkspace();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [useBrandContext, setUseBrandContext] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("Ready for a new request.");
  const [error, setError] = useState<string | null>(null);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [pending, setPending] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setBrands([]); setBrandId(null); setUseBrandContext(false); setOutput("");
    if (!selectedWorkspaceId) return () => controller.abort();
    setLoadingBrands(true);
    void apiRequest<{ brands: Brand[] }>(`/api/brands?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`, { cache: "no-store", signal: controller.signal })
      .then((body) => {
        const next = body.brands.filter((brand) => brand.workspaceId === selectedWorkspaceId);
        setBrands(next); setBrandId(next[0]?.id ?? null);
      })
      .catch(() => { if (!controller.signal.aborted) setError("Brands could not be loaded for AI context."); })
      .finally(() => { if (!controller.signal.aborted) setLoadingBrands(false); });
    return () => controller.abort();
  }, [selectedWorkspaceId]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWorkspaceId) return setError("Select a workspace before generating.");
    if (useBrandContext && !isValidBrandSelection(selectedWorkspaceId, brandId, brands)) return setError("Select a brand from the selected workspace.");
    setPending(true); setError(null); setOutput(""); setStatus(aiStreamStatus("start"));
    const controller = new AbortController();
    controllerRef.current = controller;
    cancelledRef.current = false;
    try {
      const response = await fetch("/api/ai/generate", { body: JSON.stringify({ brandId: useBrandContext ? brandId ?? undefined : undefined, prompt, stream: true, useBrandContext, workspaceId: selectedWorkspaceId }), headers: { "content-type": "application/json" }, method: "POST", signal: controller.signal });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new FlowynClientError(mapApiError(response, body));
      }
      if (!response.body) throw new Error("stream");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      while (!finished) {
        const next = await reader.read();
        buffer += decoder.decode(next.value ?? new Uint8Array(), { stream: !next.done });
        const events = buffer.split(/\r?\n\r?\n/u);
        buffer = events.pop() ?? "";
        for (const rawEvent of events) {
          const dataLine = rawEvent.split(/\r?\n/u).find((line) => line.startsWith("data: "));
          if (!dataLine) continue;
          const payload = dataLine.slice(6);
          if (payload === "[DONE]") { finished = true; setStatus(aiStreamStatus("complete")); break; }
          const streamEvent = JSON.parse(payload) as StreamEvent;
          if (streamEvent.error) {
            const code = typeof streamEvent.error.code === "string" ? streamEvent.error.code : "UNKNOWN";
            setError(safeStreamError(code)); setStatus(safeStreamError(code)); finished = true; break;
          }
          if (typeof streamEvent.text === "string") setOutput((current) => `${current}${streamEvent.text}`.slice(0, 20000));
        }
        if (next.done) finished = true;
      }
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === "AbortError") {
        if (cancelledRef.current) setStatus(aiStreamStatus("cancel"));
      } else if (caughtError instanceof FlowynClientError) {
        setError(caughtError.details.message); setStatus(caughtError.details.code.includes("PROVIDER") ? aiStreamStatus("provider") : aiStreamStatus("unknown"));
      } else {
        setError("The AI operation could not be completed."); setStatus(aiStreamStatus("unknown"));
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setPending(false);
    }
  }

  function cancelGeneration() {
    cancelledRef.current = true;
    controllerRef.current?.abort();
    setStatus(aiStreamStatus("cancel"));
  }

  return (
    <div className="space-y-8">
      <header><p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-600">AI</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">Generate with guardrails.</h1><p className="mt-3 max-w-2xl text-slate-500">Use the existing provider-neutral generation route with an explicit workspace and optional validated brand context.</p></header>
      {error ? <InlineAlert title="Generation unavailable" tone="error">{error}</InlineAlert> : null}
      {!selectedWorkspace ? <Card><h2 className="font-semibold">Select a workspace first</h2><p className="mt-1 text-sm text-slate-500">AI requests require a server-authorized workspace.</p></Card> : <Card className="bg-slate-950 text-white dark:bg-slate-950"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Selected workspace</p><h2 className="mt-2 text-xl font-semibold">{selectedWorkspace.name}</h2></div><span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-300">Provider configured server-side</span></div><form className="mt-6 space-y-5" onSubmit={(event) => void generate(event)}><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label className="text-slate-300" htmlFor="ai-brand">Brand context</Label>{loadingBrands ? <Skeleton className="h-11 bg-white/10" label="Loading brands for AI" /> : <select className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-violet-400" disabled={pending || brands.length === 0} id="ai-brand" onChange={(event) => setBrandId(event.target.value || null)} value={brandId ?? ""}><option className="text-slate-950" value="">No brand context</option>{brands.map((brand) => <option className="text-slate-950" key={brand.id} value={brand.id}>{brand.name}</option>)}</select>}</div><div className="flex items-end"><label className="flex min-h-11 items-center gap-2 text-sm text-slate-300"><input checked={useBrandContext} disabled={pending || !brandId} onChange={(event) => setUseBrandContext(event.target.checked)} type="checkbox" />Use retrieved brand knowledge</label></div></div><div className="space-y-2"><Label className="text-slate-300" htmlFor="ai-prompt">Prompt</Label><textarea aria-describedby="ai-prompt-guidance" className="min-h-36 w-full resize-y rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-violet-400" disabled={pending} id="ai-prompt" maxLength={4000} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe the bounded task you want help with…" required value={prompt} /><p className="text-xs text-slate-400" id="ai-prompt-guidance">{prompt.length}/4000 characters. Start a new request to retry.</p></div><div className="flex flex-wrap gap-2"><Button className="bg-white text-slate-950 hover:bg-slate-200" disabled={pending || !prompt.trim()} type="submit">{pending ? "Generating…" : "Generate"}</Button>{pending ? <Button onClick={cancelGeneration} type="button" variant="secondary">Cancel</Button> : null}</div></form><div aria-live="polite" className="sr-only">{status}</div><section aria-labelledby="ai-output-heading" className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4"><h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400" id="ai-output-heading">Output</h2><p className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7 text-slate-100">{output || "Your bounded output will appear here."}</p></section></Card>}
    </div>
  );
}
