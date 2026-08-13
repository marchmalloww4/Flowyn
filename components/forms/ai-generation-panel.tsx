"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function AIGenerationPanel() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(null); setResult(null);
    try {
      const response = await fetch("/api/ai/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      const body = await response.json() as { result?: { text?: string; model?: string; durationMs?: number }; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Generation failed.");
      setResult(body.result?.text ?? "The provider returned no text.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Generation failed."); } finally { setPending(false); }
  }

  return <section className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white dark:border-slate-800"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold">Local AI generation</p><p className="mt-1 text-sm text-slate-400">A real request to your configured Ollama model.</p></div><span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-semibold text-emerald-300">Ollama</span></div><form onSubmit={generate} className="mt-5 space-y-3"><Label htmlFor="ai-prompt" className="text-slate-300">Prompt</Label><textarea id="ai-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe a short welcome message for a new customer…" className="min-h-28 w-full resize-y rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400" required /><Button type="submit" disabled={pending} className="bg-white text-slate-950 hover:bg-slate-200">{pending ? "Generating…" : "Generate with Ollama"}</Button></form>{error && <p role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">{error}</p>}{result && <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Provider output</p><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-100">{result}</p></div>}</section>;
}