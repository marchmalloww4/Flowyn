"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OperationsPanel } from "@/components/forms/operations-panel";

type Workspace = { id: string; name: string; slug: string };
type Brand = { id: string; name: string; description: string | null; tone: string | null };

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? "Request failed.");
  return body;
}

export function WorkspaceBrandPanel() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [brandName, setBrandName] = useState("");
  const [brandDescription, setBrandDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function loadWorkspaces() {
    const body = await readResponse<{ workspaces: Array<{ workspace: Workspace }> }>(await fetch("/api/workspaces", { cache: "no-store" }));
    const next = body.workspaces.map((entry) => entry.workspace);
    setWorkspaces(next);
    setSelectedWorkspace((current) => current || next[0]?.id || "");
  }

  async function loadBrands(workspaceId: string) {
    if (!workspaceId) return setBrands([]);
    const body = await readResponse<{ brands: Brand[] }>(await fetch(`/api/brands?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" }));
    setBrands(body.brands);
  }

  useEffect(() => { void loadWorkspaces().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not load workspaces.")); }, []);
  useEffect(() => { void loadBrands(selectedWorkspace).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not load brands.")); }, [selectedWorkspace]);

  async function createWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage(null);
    try { await readResponse(await fetch("/api/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: workspaceName, slug: workspaceSlug }) })); setWorkspaceName(""); setWorkspaceSlug(""); await loadWorkspaces(); setMessage("Workspace created."); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create workspace."); } finally { setPending(false); }
  }

  async function createBrand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage(null);
    try { await readResponse(await fetch("/api/brands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: selectedWorkspace, name: brandName, description: brandDescription }) })); setBrandName(""); setBrandDescription(""); await loadBrands(selectedWorkspace); setMessage("Brand created."); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create brand."); } finally { setPending(false); }
  }

  return <div className="space-y-6"><div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]"><section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Workspaces</p><p className="mt-1 text-sm text-slate-500">Your tenant boundaries.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-900">{workspaces.length}</span></div><div className="mt-5 space-y-2">{workspaces.map((workspace) => <button key={workspace.id} type="button" onClick={() => setSelectedWorkspace(workspace.id)} className={`w-full rounded-2xl border px-4 py-3 text-left ${selectedWorkspace === workspace.id ? "border-violet-300 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30" : "border-slate-200 dark:border-slate-800"}`}><p className="font-medium">{workspace.name}</p><p className="mt-1 text-xs text-slate-500">/{workspace.slug}</p></button>)}{workspaces.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">Create your first workspace below.</p>}</div><form onSubmit={createWorkspace} className="mt-6 space-y-3 border-t border-slate-100 pt-5"><p className="text-sm font-semibold">New workspace</p><div className="space-y-2"><Label htmlFor="workspace-name">Name</Label><Input id="workspace-name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="Acme Operations" required /></div><div className="space-y-2"><Label htmlFor="workspace-slug">Slug</Label><Input id="workspace-slug" value={workspaceSlug} onChange={(event) => setWorkspaceSlug(event.target.value)} placeholder="acme-operations" required /></div><Button type="submit" disabled={pending} className="w-full">Create workspace</Button></form></section><section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950"><div><p className="text-sm font-semibold">Brands</p><p className="mt-1 text-sm text-slate-500">Brand context will power future agents.</p></div><div className="mt-5 space-y-3">{brands.map((brand) => <div key={brand.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800"><p className="font-semibold">{brand.name}</p><p className="mt-1 text-sm text-slate-500">{brand.description || "No description yet."}</p>{brand.tone && <p className="mt-3 text-xs text-violet-600">Tone: {brand.tone}</p>}</div>)}{selectedWorkspace && brands.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No brands in this workspace yet.</p>}</div><form onSubmit={createBrand} className="mt-6 space-y-3 border-t border-slate-100 pt-5"><p className="text-sm font-semibold">New brand</p><div className="space-y-2"><Label htmlFor="brand-name">Name</Label><Input id="brand-name" value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="Acme AI" required disabled={!selectedWorkspace} /></div><div className="space-y-2"><Label htmlFor="brand-description">Description</Label><Input id="brand-description" value={brandDescription} onChange={(event) => setBrandDescription(event.target.value)} placeholder="What the brand does" disabled={!selectedWorkspace} /></div><Button type="submit" disabled={pending || !selectedWorkspace} className="w-full">Create brand</Button></form>{message && <p role="status" className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">{message}</p>}</section></div>{selectedWorkspace && <OperationsPanel workspaceId={selectedWorkspace} />}</div>;
}
