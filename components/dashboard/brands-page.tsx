"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, FlowynClientError } from "@/lib/client/api";
import { canEditBrands, filterWorkspaceBrands, type BrandRecord } from "@/lib/client/brands-state";
import { slugSuggestion } from "@/lib/workspaces/slug";

type Brand = BrandRecord & { tone: string | null };

function safeError(error: unknown, fallback: string) {
  return error instanceof FlowynClientError ? error.details.message : fallback;
}

export function BrandsPage() {
  const { reload, selectedMembership, selectedWorkspace, selectedWorkspaceId } = useWorkspace();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [workspaceSlugEdited, setWorkspaceSlugEdited] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [brandName, setBrandName] = useState("");
  const [brandDescription, setBrandDescription] = useState("");
  const [editing, setEditing] = useState<Brand | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Brand | null>(null);
  const [pending, setPending] = useState(false);

  const canEdit = canEditBrands(selectedMembership?.role);

  useEffect(() => {
    const firstField = Object.keys(fieldErrors)[0];
    if (!firstField) return;
    const inputId = firstField === "name" ? "new-workspace-name" : firstField === "slug" ? "new-workspace-slug" : null;
    if (inputId) window.requestAnimationFrame(() => document.getElementById(inputId)?.focus());
  }, [fieldErrors]);

  useEffect(() => {
    const controller = new AbortController();
    setBrands([]);
    setMessage(null);
    if (!selectedWorkspaceId) return () => controller.abort();
    setLoading(true);
    void apiRequest<{ brands: Brand[] }>(`/api/brands?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`, { cache: "no-store", signal: controller.signal })
      .then((body) => setBrands(filterWorkspaceBrands(body.brands, selectedWorkspaceId) as Brand[]))
      .catch((error: unknown) => { if (!controller.signal.aborted) setMessage(safeError(error, "Brands could not be loaded.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedWorkspaceId]);

  async function createWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setMessage(null); setFieldErrors({});
    try {
      await apiRequest("/api/workspaces", { body: JSON.stringify({ name: workspaceName, slug: workspaceSlug || undefined }), headers: { "content-type": "application/json" }, method: "POST" });
      setWorkspaceName(""); setWorkspaceSlug(""); setWorkspaceSlugEdited(false); await reload(); setMessage("Workspace created.");
    } catch (error) {
      if (error instanceof FlowynClientError) setFieldErrors(error.details.fields);
      setMessage(safeError(error, "Workspace could not be created."));
    } finally { setPending(false); }
  }

  async function createBrand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWorkspaceId) return;
    setPending(true); setMessage(null);
    try {
      await apiRequest("/api/brands", { body: JSON.stringify({ description: brandDescription, name: brandName, workspaceId: selectedWorkspaceId }), headers: { "content-type": "application/json" }, method: "POST" });
      setBrandName(""); setBrandDescription("");
      const body = await apiRequest<{ brands: Brand[] }>(`/api/brands?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`, { cache: "no-store" });
      setBrands(filterWorkspaceBrands(body.brands, selectedWorkspaceId) as Brand[]); setMessage("Brand created.");
    } catch (error) { setMessage(safeError(error, "Brand could not be created.")); } finally { setPending(false); }
  }

  async function saveBrand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setPending(true); setMessage(null);
    try {
      const body = await apiRequest<{ brand: Brand }>(`/api/brands/${encodeURIComponent(editing.id)}`, { body: JSON.stringify({ description: editing.description ?? "", name: editing.name }), headers: { "content-type": "application/json" }, method: "PATCH" });
      setBrands((current) => current.map((brand) => brand.id === body.brand.id && brand.workspaceId === selectedWorkspaceId ? body.brand : brand));
      setEditing(null); setMessage("Brand updated.");
    } catch (error) { setMessage(safeError(error, "Brand could not be updated.")); } finally { setPending(false); }
  }

  async function deleteBrand() {
    if (!deleteTarget || !selectedWorkspaceId) return;
    setPending(true); setMessage(null);
    try {
      await apiRequest(`/api/brands/${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      setBrands((current) => current.filter((brand) => brand.id !== deleteTarget.id)); setDeleteTarget(null); setMessage("Brand deleted.");
    } catch (error) { setMessage(safeError(error, "Brand could not be deleted.")); } finally { setPending(false); }
  }

  return (
    <div className="space-y-8">
      <header><p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-600">Workspace and brands</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">Make your context useful.</h1><p className="mt-3 max-w-2xl text-slate-500">Manage the workspace boundary and the brand profiles used by existing knowledge, AI, agent, and workflow features.</p></header>
      {message ? <InlineAlert tone={message === "Workspace created." ? "success" : "error"}>{message}</InlineAlert> : null}
      {!selectedWorkspace ? <section className="grid gap-6 lg:grid-cols-2"><EmptyState title="No workspace yet" description="Create a workspace to keep your brands, knowledge, and automations isolated." /><form className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950" onSubmit={createWorkspace}><h2 className="text-lg font-semibold">Create workspace</h2><p className="mt-1 text-sm text-slate-500">This creates the first server-authorized membership.</p><div className="mt-5 space-y-4"><FormField description="Use a name your team will recognize." error={fieldErrors.name?.[0]} label="Workspace name" htmlFor="new-workspace-name" required><Input id="new-workspace-name" onChange={(event) => { const value = event.target.value; setWorkspaceName(value); if (!workspaceSlugEdited) setWorkspaceSlug(slugSuggestion(value)); }} required value={workspaceName} /></FormField><FormField description="A short URL-friendly identifier for your workspace." error={fieldErrors.slug?.[0]} label="Workspace slug" htmlFor="new-workspace-slug"><Input id="new-workspace-slug" onChange={(event) => { setWorkspaceSlugEdited(true); setWorkspaceSlug(event.target.value); }} placeholder="acme-operations" value={workspaceSlug} /></FormField><Button disabled={pending} type="submit" variant="default"><Plus aria-hidden className="h-4 w-4" />Create workspace</Button></div></form></section> : <>
        <section aria-label="Selected workspace" className="rounded-3xl border border-violet-100 bg-violet-50/60 p-6 dark:border-violet-950 dark:bg-violet-950/20"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-200">Selected workspace</p><div className="mt-2 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-semibold">{selectedWorkspace.name}</h2><p className="mt-1 text-sm text-slate-500">/{selectedWorkspace.slug} · {selectedMembership?.role ?? "member"}</p></div>{!canEdit ? <p className="text-sm text-slate-600 dark:text-slate-300">You have read-only brand access.</p> : null}</div></section>
        {canEdit ? <form className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950" onSubmit={createBrand}><h2 className="text-lg font-semibold">Add a brand</h2><div className="mt-5 grid gap-4 md:grid-cols-2"><FormField label="Brand name" htmlFor="brand-name"><Input id="brand-name" onChange={(event) => setBrandName(event.target.value)} required value={brandName} /></FormField><FormField label="Short description" htmlFor="brand-description"><Input id="brand-description" onChange={(event) => setBrandDescription(event.target.value)} value={brandDescription} /></FormField></div><Button className="mt-4" disabled={pending} type="submit"><Plus aria-hidden className="h-4 w-4" />Add brand</Button></form> : null}
        <section aria-labelledby="brands-heading"><div className="flex items-end justify-between gap-3"><div><h2 className="text-xl font-semibold" id="brands-heading">Brands in {selectedWorkspace.name}</h2><p className="mt-1 text-sm text-slate-500">Only records returned for this workspace are shown.</p></div></div>{loading ? <div className="mt-4 grid gap-4 md:grid-cols-2"><Skeleton className="h-32" label="Loading brand" /><Skeleton className="h-32" label="Loading brand" /></div> : brands.length === 0 ? <div className="mt-4"><EmptyState title="No brands yet" description={canEdit ? "Add a brand to begin building bounded context." : "A workspace administrator can add the first brand."} /></div> : <div className="mt-4 grid gap-4 md:grid-cols-2">{brands.map((brand) => <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950" key={brand.id}><div className="flex items-start justify-between gap-4"><div><h3 className="font-semibold">{brand.name}</h3><p className="mt-2 text-sm text-slate-500">{brand.description || "No description yet."}</p>{brand.tone ? <p className="mt-3 text-xs text-violet-600">Tone: {brand.tone}</p> : null}</div>{canEdit ? <div className="flex gap-1"><Button aria-label={`Edit ${brand.name}`} onClick={() => setEditing({ ...brand })} size="icon" variant="ghost"><Pencil aria-hidden className="h-4 w-4" /></Button><Button aria-label={`Delete ${brand.name}`} onClick={() => setDeleteTarget(brand)} size="icon" variant="ghost"><Trash2 aria-hidden className="h-4 w-4" /></Button></div> : null}</div></article>)}</div>}</section>
      </>}
      {editing ? <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4"><form aria-label="Edit brand" className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-950" onSubmit={saveBrand}><h2 className="text-lg font-semibold">Edit {editing.name}</h2><div className="mt-5 space-y-4"><FormField label="Brand name" htmlFor="edit-brand-name"><Input id="edit-brand-name" onChange={(event) => setEditing({ ...editing, name: event.target.value })} required value={editing.name} /></FormField><FormField label="Short description" htmlFor="edit-brand-description"><Input id="edit-brand-description" onChange={(event) => setEditing({ ...editing, description: event.target.value })} value={editing.description ?? ""} /></FormField></div><div className="mt-6 flex justify-end gap-2"><Button onClick={() => setEditing(null)} type="button" variant="outline">Cancel</Button><Button disabled={pending} type="submit">Save changes</Button></div></form></div> : null}
      <ConfirmDialog confirmLabel="Delete brand" description={deleteTarget ? `Delete ${deleteTarget.name}? Existing workspace references will no longer use this brand.` : ""} onCancel={() => setDeleteTarget(null)} onConfirm={() => void deleteBrand()} open={Boolean(deleteTarget)} pending={pending} title="Delete brand" destructive />
    </div>
  );
}
