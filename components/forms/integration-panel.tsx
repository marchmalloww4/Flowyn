"use client";

import { useCallback, useEffect, useState } from "react";
import { CredentialForm } from "@/components/integrations/credential-form";
import { CredentialList, type Credential } from "@/components/integrations/credential-list";
import { Button } from "@/components/ui/button";
import { canManageIntegrationCredentials } from "@/lib/integrations/ui";

type Workspace = { id: string; name: string; role: "OWNER" | "ADMIN" | "MEMBER" };
type ErrorBody = { error?: { message?: string } };

async function readIntegrationResponse<T>(response: Response): Promise<T> {
  const body = response.status === 204 ? undefined : await response.json() as T & ErrorBody;
  if (!response.ok) throw new Error((body as ErrorBody | undefined)?.error?.message ?? "Request failed.");
  return body as T;
}

export function IntegrationPanel() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const selected = workspaces.find((workspace) => workspace.id === workspaceId);
  const canManage = selected ? canManageIntegrationCredentials(selected.role) : false;

  const loadCredentials = useCallback(async (nextWorkspaceId = workspaceId) => {
    if (!nextWorkspaceId) return setCredentials([]);
    const body = await readIntegrationResponse<{ credentials: Credential[] }>(await fetch(`/api/integration-credentials?workspaceId=${encodeURIComponent(nextWorkspaceId)}`, { cache: "no-store" }));
    setCredentials(body.credentials);
  }, [workspaceId]);

  useEffect(() => { void (async () => { const body = await readIntegrationResponse<{ workspaces: Array<{ workspace: Omit<Workspace, "role">; role: Workspace["role"] }> }>(await fetch("/api/workspaces", { cache: "no-store" })); const next = body.workspaces.map((entry) => ({ ...entry.workspace, role: entry.role })); setWorkspaces(next); setWorkspaceId(next[0]?.id ?? ""); })().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load integration workspaces.")); }, []);
  useEffect(() => { void loadCredentials().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load credentials.")); }, [loadCredentials]);

  async function create(name: string, apiToken: string) {
    setError(null); setMessage(null);
    await readIntegrationResponse(await fetch("/api/integration-credentials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, connectorId: "slack", name, secret: { apiToken } }) }));
    await loadCredentials(); setMessage("Credential saved. Flowyn will never display the token again.");
  }

  async function rotate(credential: Credential) {
    const apiToken = window.prompt("Paste the replacement Slack token. It will not be displayed again.");
    if (!apiToken) return;
    try { await readIntegrationResponse(await fetch(`/api/integration-credentials/${credential.id}/rotate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: { apiToken } }) })); await loadCredentials(); setMessage("Credential rotated."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not rotate credential."); }
  }

  async function revoke(credential: Credential) {
    if (!window.confirm(`Revoke ${credential.name}?`)) return;
    try { await readIntegrationResponse(await fetch(`/api/integration-credentials/${credential.id}`, { method: "DELETE" })); await loadCredentials(); setMessage("Credential revoked."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not revoke credential."); }
  }

  return <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.14em] text-fuchsia-600">Secure integrations</p><h2 className="mt-2 text-2xl font-semibold">Workspace credentials</h2><p className="mt-2 max-w-2xl text-sm text-slate-500">Milestone 11 supports one server-controlled Slack operation. Tokens stay encrypted and never enter workflow data, queues, AI prompts, or browser responses.</p></div><span className="rounded-full bg-fuchsia-100 px-2.5 py-1 text-xs font-semibold text-fuchsia-700">Milestone 11</span></div><select aria-label="Integration workspace" className="mt-5 h-10 w-full rounded-xl border bg-transparent px-3 text-sm" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}><option value="">Select workspace</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name} ({workspace.role})</option>)}</select>{workspaceId && <><div className="mt-5"><CredentialForm disabled={!canManage} onSubmit={create} /></div><div className="mt-5"><CredentialList credentials={credentials} canManage={canManage} onRotate={(credential) => void rotate(credential)} onRevoke={(credential) => void revoke(credential)} /></div></>}{message && <p role="status" className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{message}</p>}{error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}<div className="mt-4 flex justify-end"><Button type="button" variant="ghost" size="sm" onClick={() => void loadCredentials()}>Refresh</Button></div></section>;
}
