"use client";

import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, FlowynClientError } from "@/lib/client/api";
import { canManageMemberships, canManageWorkspace, settingsRoleLabel } from "@/lib/client/settings-state";

type Member = { id: string; userId: string; name: string; email: string; role: "OWNER" | "ADMIN" | "MEMBER"; createdAt: string };
type ConfirmAction = { type: "remove" | "leave" | "delete"; member?: Member } | null;
function safeError(error: unknown, fallback: string) { return error instanceof FlowynClientError ? error.details.message : fallback; }

export function SettingsPage() {
  const { reload, selectedMembership, selectedWorkspace, selectedWorkspaceId } = useWorkspace();
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [confirm, setConfirm] = useState<ConfirmAction>(null);
  const canManage = canManageWorkspace(selectedMembership?.role);
  const canManageMembers = canManageMemberships(selectedMembership?.role);
  const isOwner = selectedMembership?.role === "OWNER";

  useEffect(() => {
    const firstField = Object.keys(fieldErrors)[0];
    if (!firstField) return;
    const inputId = firstField === "name" ? "settings-workspace-name" : firstField === "slug" ? "settings-workspace-slug" : null;
    if (inputId) window.requestAnimationFrame(() => document.getElementById(inputId)?.focus());
  }, [fieldErrors]);

  useEffect(() => {
    setName(selectedWorkspace?.name ?? ""); setSlug(selectedWorkspace?.slug ?? ""); setMembers([]); setMessage(null); setError(null); setFieldErrors({});
    if (!selectedWorkspaceId) return;
    setLoading(true);
    const controller = new AbortController();
    void apiRequest<{ members: Member[] }>(`/api/workspaces/${encodeURIComponent(selectedWorkspaceId)}/members`, { cache: "no-store", signal: controller.signal })
      .then((body) => setMembers(body.members))
      .catch((caughtError: unknown) => { if (!controller.signal.aborted) setError(safeError(caughtError, "Workspace members could not be loaded.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedWorkspace, selectedWorkspaceId]);

  async function saveWorkspace(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (!selectedWorkspaceId || !canManage) return; setPending(true); setError(null); setFieldErrors({}); try { await apiRequest(`/api/workspaces/${encodeURIComponent(selectedWorkspaceId)}`, { body: JSON.stringify({ name, slug }), headers: { "content-type": "application/json" }, method: "PATCH" }); await reload(); setMessage("Workspace settings updated."); } catch (caughtError) { if (caughtError instanceof FlowynClientError) setFieldErrors(caughtError.details.fields); setError(safeError(caughtError, "Workspace settings could not be updated.")); } finally { setPending(false); } }
  async function refreshMembers() { if (!selectedWorkspaceId) return; const body = await apiRequest<{ members: Member[] }>(`/api/workspaces/${encodeURIComponent(selectedWorkspaceId)}/members`, { cache: "no-store" }); setMembers(body.members); }
  async function addMember(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (!selectedWorkspaceId || !canManageMembers) return; setPending(true); setError(null); try { await apiRequest(`/api/workspaces/${encodeURIComponent(selectedWorkspaceId)}/members`, { body: JSON.stringify({ email: memberEmail, role: memberRole }), headers: { "content-type": "application/json" }, method: "POST" }); setMemberEmail(""); await refreshMembers(); setMessage("Member added."); } catch (caughtError) { setError(safeError(caughtError, "Member could not be added.")); } finally { setPending(false); } }
  async function changeRole(member: Member, role: Member["role"]) { if (!selectedWorkspaceId || !isOwner) return; setPending(true); try { await apiRequest(`/api/workspaces/${encodeURIComponent(selectedWorkspaceId)}/members/${encodeURIComponent(member.userId)}`, { body: JSON.stringify({ role }), headers: { "content-type": "application/json" }, method: "PATCH" }); await refreshMembers(); setMessage("Member role updated."); } catch (caughtError) { setError(safeError(caughtError, "Member role could not be updated.")); } finally { setPending(false); } }
  async function confirmAction() { if (!confirm || !selectedWorkspaceId) return; setPending(true); try { if (confirm.type === "delete") await apiRequest(`/api/workspaces/${encodeURIComponent(selectedWorkspaceId)}`, { method: "DELETE" }); else if (confirm.type === "leave") await apiRequest(`/api/workspaces/${encodeURIComponent(selectedWorkspaceId)}/leave`, { method: "POST" }); else if (confirm.member) await apiRequest(`/api/workspaces/${encodeURIComponent(selectedWorkspaceId)}/members/${encodeURIComponent(confirm.member.userId)}`, { method: "DELETE" }); const actionType = confirm.type; setConfirm(null); await reload(); setMessage(actionType === "delete" ? "Workspace deleted." : actionType === "leave" ? "You left the workspace." : "Member removed."); } catch (caughtError) { setError(safeError(caughtError, "Workspace action could not be completed.")); } finally { setPending(false); } }

  return (
    <div className="space-y-8">
      <header><p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-600">Workspace / Settings</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">Keep the boundary clear.</h1><p className="mt-3 max-w-2xl text-slate-500">Manage workspace metadata and membership using the existing OWNER, ADMIN, and MEMBER protections.</p></header>
      {message ? <InlineAlert tone="success">{message}</InlineAlert> : null}
      {error ? <InlineAlert title="Settings operation unavailable" tone="error">{error}</InlineAlert> : null}
      {!selectedWorkspace ? <EmptyState title="No workspace selected" description="Create a workspace from Brands to manage its settings." /> : <>
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950"><div className="flex items-start gap-3"><Settings aria-hidden className="mt-0.5 h-5 w-5 text-violet-600" /><div><h2 className="text-lg font-semibold">Workspace details</h2><p className="mt-1 text-sm text-slate-500">Your role: {settingsRoleLabel(selectedMembership?.role ?? "MEMBER")}</p></div></div>{canManage ? <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={(event) => void saveWorkspace(event)}><FormField description="This name is shown throughout Flowyn." error={fieldErrors.name?.[0]} htmlFor="settings-workspace-name" label="Workspace name"><Input id="settings-workspace-name" onChange={(event) => setName(event.target.value)} required value={name} /></FormField><FormField description="Use lowercase letters, numbers, and hyphens." error={fieldErrors.slug?.[0]} htmlFor="settings-workspace-slug" label="Workspace slug"><Input id="settings-workspace-slug" onChange={(event) => setSlug(event.target.value)} required value={slug} /></FormField><Button className="sm:col-span-2" disabled={pending} type="submit">Save workspace</Button></form> : <p className="mt-5 text-sm text-slate-500">Members can view workspace details. Metadata changes remain management actions.</p>}</section>
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950"><h2 className="text-lg font-semibold">Membership</h2><p className="mt-1 text-sm text-slate-500">Server membership and last-owner protections remain authoritative.</p>{canManageMembers ? <form className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => void addMember(event)}><FormField className="flex-1" htmlFor="member-email" label="User email"><Input id="member-email" onChange={(event) => setMemberEmail(event.target.value)} required type="email" value={memberEmail} /></FormField><div className="space-y-2"><label className="block text-sm font-medium" htmlFor="member-role">Role</label><select className="h-10 rounded-xl border bg-transparent px-3 text-sm" id="member-role" onChange={(event) => setMemberRole(event.target.value as "ADMIN" | "MEMBER")} value={memberRole}><option value="MEMBER">Member</option><option disabled={!isOwner} value="ADMIN">Administrator</option></select></div><Button disabled={pending} type="submit">Add member</Button></form> : null}{loading ? <div className="mt-5 space-y-3"><Skeleton className="h-16" label="Loading member" /><Skeleton className="h-16" label="Loading member" /></div> : <div className="mt-5 space-y-3">{members.map((member) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800" key={member.id}><div><p className="font-medium">{member.name || member.email}</p><p className="text-xs text-slate-500">{member.email}</p></div><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-slate-500">{settingsRoleLabel(member.role)}</span>{isOwner && member.role !== "OWNER" ? <select aria-label={`Role for ${member.email}`} className="h-9 rounded-lg border bg-transparent px-2 text-xs" disabled={pending} onChange={(event) => void changeRole(member, event.target.value as Member["role"])} value={member.role}><option value="MEMBER">Member</option><option value="ADMIN">Administrator</option><option value="OWNER">Owner</option></select> : null}{canManageMembers && member.role !== "OWNER" ? <Button disabled={pending} onClick={() => setConfirm({ member, type: "remove" })} size="sm" variant="outline">Remove</Button> : null}</div></div>)}{members.length === 0 ? <p className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">No members returned.</p> : null}</div>}</section>
        <section className="flex flex-wrap gap-3"><Button onClick={() => setConfirm({ type: "leave" })} variant="outline">Leave workspace</Button>{isOwner ? <Button onClick={() => setConfirm({ type: "delete" })} variant="outline">Delete workspace</Button> : null}</section>
      </>}
      {confirm ? <ConfirmDialog confirmLabel={confirm.type === "delete" ? "Delete workspace" : confirm.type === "leave" ? "Leave workspace" : "Remove member"} description={confirm.type === "delete" ? "Delete this workspace and its workspace-scoped data? This action cannot be undone from the UI." : confirm.type === "leave" ? "Leave this workspace? You may need to be invited again." : `Remove ${confirm.member?.email ?? "this member"} from the workspace?`} onCancel={() => setConfirm(null)} onConfirm={() => void confirmAction()} open pending={pending} title={confirm.type === "delete" ? "Delete workspace" : confirm.type === "leave" ? "Leave workspace" : "Remove member"} destructive /> : null}
    </div>
  );
}
