"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Workspace = { id: string; name: string };
type Brand = { id: string; name: string };
type Document = { id: string; title: string; content: string; status: "PENDING" | "PROCESSING" | "READY" | "FAILED"; sourceName: string | null; errorCode: string | null };

export async function readResponse<T>(response: Response): Promise<T>;
export async function readResponse(response: Response): Promise<void>;
export async function readResponse<T>(response: Response): Promise<T | void> {
  if (response.status === 204) return;
  const body = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? "Request failed.");
  return body;
}

export function KnowledgePanel() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [title, setTitle] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const loadDocuments = useCallback(async () => {
    if (!workspaceId || !brandId) return setDocuments([]);
    const body = await readResponse<{ documents: Document[] }>(await fetch(`/api/knowledge?workspaceId=${encodeURIComponent(workspaceId)}&brandId=${encodeURIComponent(brandId)}`, { cache: "no-store" }));
    setDocuments(body.documents);
  }, [workspaceId, brandId]);

  useEffect(() => { void (async () => { const body = await readResponse<{ workspaces: Array<{ workspace: Workspace }> }>(await fetch("/api/workspaces", { cache: "no-store" })); const next = body.workspaces.map((entry) => entry.workspace); setWorkspaces(next); setWorkspaceId(next[0]?.id ?? ""); })().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not load workspaces.")); }, []);
  useEffect(() => { setBrandId(""); if (!workspaceId) return setBrands([]); void (async () => { const body = await readResponse<{ brands: Brand[] }>(await fetch(`/api/brands?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" })); setBrands(body.brands); })().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not load brands.")); }, [workspaceId]);
  useEffect(() => { void loadDocuments().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not load knowledge.")); }, [loadDocuments]);

  function resetForm() { setEditingId(null); setTitle(""); setSourceName(""); setContent(""); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!workspaceId || !brandId) return setMessage("Select a workspace and brand first."); setPending(true); setMessage(null);
    try {
      if (editingId) {
        await readResponse(await fetch(`/api/knowledge/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, sourceName, content, metadata: {} }) }));
        await readResponse(await fetch(`/api/knowledge/${editingId}/reindex`, { method: "POST" }));
      } else {
        await readResponse(await fetch("/api/knowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, brandId, title, sourceName, content, metadata: {} }) }));
      }
      resetForm(); await loadDocuments(); setMessage(editingId ? "Knowledge updated and re-indexed." : "Knowledge added and indexed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save knowledge."); await loadDocuments().catch(() => undefined); } finally { setPending(false); }
  }
  async function remove(id: string) { setPending(true); try { await readResponse(await fetch(`/api/knowledge/${id}`, { method: "DELETE" })); await loadDocuments(); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not delete knowledge."); } finally { setPending(false); } }
  async function reindex(id: string) { setPending(true); try { await readResponse(await fetch(`/api/knowledge/${id}/reindex`, { method: "POST" })); await loadDocuments(); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not re-index knowledge."); } finally { setPending(false); } }

  return <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold">Brand knowledge</p><p className="mt-1 text-sm text-slate-500">Add bounded local knowledge for retrieval and brand-aware generation.</p></div><span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">Local RAG</span></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="knowledge-workspace">Workspace</Label><select id="knowledge-workspace" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm"><option value="">Select workspace</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="knowledge-brand">Brand</Label><select id="knowledge-brand" value={brandId} onChange={(event) => setBrandId(event.target.value)} className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm"><option value="">Select brand</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></div></div><form onSubmit={save} className="mt-5 space-y-3"><div className="grid gap-3 sm:grid-cols-2"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Document title" required /><Input value={sourceName} onChange={(event) => setSourceName(event.target.value)} placeholder="Source name (optional)" /></div><textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Paste brand facts, product notes, or guidelines..." className="min-h-28 w-full rounded-2xl border bg-transparent px-4 py-3 text-sm" required /><div className="flex gap-2"><Button type="submit" disabled={pending || !brandId}>{pending ? "Saving..." : editingId ? "Update knowledge" : "Add and index"}</Button>{editingId && <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>}</div></form><div className="mt-6 space-y-3">{documents.map((document) => <article key={document.id} className="rounded-2xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{document.title}</p><p className="mt-1 text-xs text-slate-500">{document.sourceName || "Manual source"}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{document.status}</span></div>{document.errorCode && <p className="mt-2 text-xs text-red-600">{document.errorCode}</p>}<div className="mt-3 flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => { setEditingId(document.id); setTitle(document.title); setSourceName(document.sourceName ?? ""); setContent(document.content); }}>Edit</Button><Button type="button" variant="outline" size="sm" onClick={() => void reindex(document.id)} disabled={pending}>Re-index</Button><Button type="button" variant="outline" size="sm" onClick={() => void remove(document.id)} disabled={pending}>Delete</Button></div></article>)}{brandId && documents.length === 0 && <p className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">No knowledge documents for this brand yet.</p>}</div>{message && <p role="status" className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{message}</p>}</section>;
}
