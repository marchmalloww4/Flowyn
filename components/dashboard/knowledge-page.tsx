"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RefreshCw } from "lucide-react";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiRequest, FlowynClientError } from "@/lib/client/api";
import { canEditBrands } from "@/lib/client/brands-state";
import { filterWorkspaceDocuments, knowledgeStatusPresentation, type KnowledgeDocumentRecord, type KnowledgeStatus } from "@/lib/client/knowledge-state";

type Brand = { id: string; workspaceId: string; name: string };
type Document = KnowledgeDocumentRecord & { title: string; content: string; sourceName: string | null; errorCode: string | null };

function safeError(error: unknown, fallback: string) {
  return error instanceof FlowynClientError ? error.details.message : fallback;
}

export function KnowledgePage() {
  const { selectedMembership, selectedWorkspace, selectedWorkspaceId } = useWorkspace();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<Document | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const [pending, setPending] = useState(false);
  const canEdit = canEditBrands(selectedMembership?.role);

  useEffect(() => {
    const controller = new AbortController();
    setBrands([]); setBrandId(""); setDocuments([]); setMessage(null);
    if (!selectedWorkspaceId) return () => controller.abort();
    void apiRequest<{ brands: Brand[] }>(`/api/brands?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`, { cache: "no-store", signal: controller.signal })
      .then((body) => {
        const next = body.brands.filter((brand) => brand.workspaceId === selectedWorkspaceId);
        setBrands(next); setBrandId(next[0]?.id ?? "");
      })
      .catch((error: unknown) => { if (!controller.signal.aborted) setMessage(safeError(error, "Brands could not be loaded.")); });
    return () => controller.abort();
  }, [selectedWorkspaceId]);

  useEffect(() => {
    const controller = new AbortController();
    setDocuments([]); setEditing(null);
    if (!selectedWorkspaceId || !brandId) return () => controller.abort();
    setLoading(true);
    void apiRequest<{ documents: Document[] }>(`/api/knowledge?workspaceId=${encodeURIComponent(selectedWorkspaceId)}&brandId=${encodeURIComponent(brandId)}`, { cache: "no-store", signal: controller.signal })
      .then((body) => setDocuments(filterWorkspaceDocuments(body.documents, selectedWorkspaceId, brandId) as Document[]))
      .catch((error: unknown) => { if (!controller.signal.aborted) setMessage(safeError(error, "Knowledge could not be loaded.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [brandId, selectedWorkspaceId]);

  function resetForm() { setEditing(null); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWorkspaceId || !brandId || !editing) return;
    setPending(true); setMessage(null);
    const isExisting = documents.some((document) => document.id === editing.id);
    try {
      if (isExisting) {
        await apiRequest(`/api/knowledge/${encodeURIComponent(editing.id)}`, { body: JSON.stringify({ content: editing.content, metadata: {}, sourceName: editing.sourceName ?? "", title: editing.title }), headers: { "content-type": "application/json" }, method: "PATCH" });
        await apiRequest(`/api/knowledge/${encodeURIComponent(editing.id)}/reindex`, { method: "POST" });
      } else {
        await apiRequest("/api/knowledge", { body: JSON.stringify({ brandId, content: editing.content, metadata: {}, sourceName: editing.sourceName ?? "", sourceType: "manual", title: editing.title, workspaceId: selectedWorkspaceId }), headers: { "content-type": "application/json" }, method: "POST" });
      }
      resetForm(); await refreshDocuments(); setMessage(isExisting ? "Knowledge updated and re-indexed." : "Knowledge added and indexed.");
    } catch (error) { setMessage(safeError(error, "Knowledge could not be saved.")); await refreshDocuments(); } finally { setPending(false); }
  }

  async function refreshDocuments() {
    if (!selectedWorkspaceId || !brandId) return;
    const body = await apiRequest<{ documents: Document[] }>(`/api/knowledge?workspaceId=${encodeURIComponent(selectedWorkspaceId)}&brandId=${encodeURIComponent(brandId)}`, { cache: "no-store" });
    setDocuments(filterWorkspaceDocuments(body.documents, selectedWorkspaceId, brandId) as Document[]);
  }

  async function reindex(document: Document) {
    setPending(true); setMessage(null);
    try { await apiRequest(`/api/knowledge/${encodeURIComponent(document.id)}/reindex`, { method: "POST" }); await refreshDocuments(); setMessage("Re-index requested."); }
    catch (error) { setMessage(safeError(error, "Knowledge could not be re-indexed.")); } finally { setPending(false); }
  }

  async function removeDocument() {
    if (!deleteTarget) return;
    setPending(true); setMessage(null);
    try { await apiRequest(`/api/knowledge/${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" }); setDeleteTarget(null); await refreshDocuments(); setMessage("Knowledge deleted."); }
    catch (error) { setMessage(safeError(error, "Knowledge could not be deleted.")); } finally { setPending(false); }
  }

  const form = editing ? <form aria-label={documents.some((document) => document.id === editing.id) ? "Edit knowledge" : "Add knowledge"} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950" onSubmit={(event) => void save(event)}><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{documents.some((document) => document.id === editing.id) ? "Edit knowledge" : "Add knowledge"}</h2><p className="mt-1 text-sm text-slate-500">Manual text only. No files or external URLs are accepted.</p></div><Button onClick={resetForm} type="button" variant="outline">Cancel</Button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><FormField htmlFor="knowledge-title" label="Document title"><Input id="knowledge-title" onChange={(event) => setEditing({ ...editing, title: event.target.value })} required value={editing.title} /></FormField><FormField htmlFor="knowledge-source" label="Source name"><Input id="knowledge-source" onChange={(event) => setEditing({ ...editing, sourceName: event.target.value })} value={editing.sourceName ?? ""} /></FormField></div><FormField className="mt-4" description="Paste bounded brand facts, product notes, or guidelines. Character count is shown; the server remains authoritative for limits." htmlFor="knowledge-content" label="Knowledge text"><textarea aria-describedby="knowledge-content-description" className="min-h-48 w-full rounded-2xl border border-slate-200 bg-transparent px-4 py-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-violet-500" id="knowledge-content" maxLength={50000} onChange={(event) => setEditing({ ...editing, content: event.target.value })} required value={editing.content} /></FormField><p className="text-right text-xs text-slate-500">{editing.content.length} characters</p><Button disabled={pending || !canEdit} type="submit">{pending ? "Saving…" : documents.some((document) => document.id === editing.id) ? "Update and re-index" : "Add and index"}</Button></form> : null;

  return (
    <div className="space-y-8">
      <header><p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-600">Knowledge</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">Make retrieval trustworthy.</h1><p className="mt-3 max-w-2xl text-slate-500">Keep manual, workspace-isolated knowledge clear while indexing status remains visible and safe.</p></header>
      {message ? <InlineAlert tone={message.includes("could not") ? "error" : "success"}>{message}</InlineAlert> : null}
      {!selectedWorkspace ? <EmptyState title="Create a workspace first" description="Knowledge belongs to a workspace and brand. Start from the Brands page." /> : brands.length === 0 ? <EmptyState title="Add a brand first" description="Create a brand before adding bounded knowledge." /> : <>
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950"><div className="max-w-md"><label className="block text-sm font-semibold" htmlFor="knowledge-brand-select">Brand</label><select className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500" id="knowledge-brand-select" onChange={(event) => setBrandId(event.target.value)} value={brandId}>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></div></section>
        {canEdit && !editing ? <Button onClick={() => setEditing({ brandId, content: "", errorCode: null, id: "new", status: "PENDING", title: "", sourceName: "", workspaceId: selectedWorkspace.id })}><RefreshCw aria-hidden className="h-4 w-4" />Add knowledge</Button> : null}
        {form}
        <section aria-labelledby="knowledge-documents-heading"><div className="flex items-end justify-between gap-3"><div><h2 className="text-xl font-semibold" id="knowledge-documents-heading">Documents</h2><p className="mt-1 text-sm text-slate-500">Only documents returned for the selected workspace and brand are shown.</p></div></div>{loading ? <div className="mt-4 grid gap-4"><Skeleton className="h-32" label="Loading knowledge document" /><Skeleton className="h-32" label="Loading knowledge document" /></div> : documents.length === 0 ? <div className="mt-4"><EmptyState title="No knowledge yet" description={canEdit ? "Add bounded text to create the first document." : "A workspace administrator can add knowledge here."} /></div> : <div className="mt-4 space-y-3">{documents.map((document) => { const status = knowledgeStatusPresentation(document.status as KnowledgeStatus); return <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950" key={document.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{document.title}</h3><p className="mt-1 text-xs text-slate-500">{document.sourceName || "Manual source"} · {document.content.length} characters</p></div><StatusBadge tone={status.tone}>{status.label}</StatusBadge></div>{document.errorCode ? <p className="mt-3 text-xs text-rose-700 dark:text-rose-200">Failure code: {document.errorCode}</p> : null}<div className="mt-4 flex flex-wrap gap-2">{canEdit ? <><Button onClick={() => setEditing(document)} size="sm" variant="outline">Edit</Button><Button disabled={pending} onClick={() => void reindex(document)} size="sm" variant="outline">Re-index</Button><Button disabled={pending} onClick={() => setDeleteTarget(document)} size="sm" variant="outline">Delete</Button></> : null}</div></article>; })}</div>}</section>
      </>}
      <ConfirmDialog confirmLabel="Delete document" description={deleteTarget ? `Delete ${deleteTarget.title}? This removes the workspace document and its indexed content.` : ""} onCancel={() => setDeleteTarget(null)} onConfirm={() => void removeDocument()} open={Boolean(deleteTarget)} pending={pending} title="Delete knowledge document" destructive />
    </div>
  );
}
