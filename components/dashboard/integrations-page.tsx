"use client";

import { useEffect, useState } from "react";
import { CredentialForm } from "@/components/integrations/credential-form";
import { CredentialList, type Credential } from "@/components/integrations/credential-list";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, FlowynClientError } from "@/lib/client/api";
import { canManageCredentials } from "@/lib/client/integrations-state";

function safeError(error: unknown, fallback: string) { return error instanceof FlowynClientError ? error.details.message : fallback; }

export function IntegrationsPage() {
  const { selectedMembership, selectedWorkspace, selectedWorkspaceId } = useWorkspace();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rotateTarget, setRotateTarget] = useState<Credential | null>(null);
  const [rotateToken, setRotateToken] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<Credential | null>(null);
  const [pending, setPending] = useState(false);
  const canManage = canManageCredentials(selectedMembership?.role);

  useEffect(() => {
    const controller = new AbortController();
    setCredentials([]); setMessage(null); setError(null);
    if (!selectedWorkspaceId) return () => controller.abort();
    setLoading(true);
    void apiRequest<{ credentials: Credential[] }>(`/api/integration-credentials?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`, { cache: "no-store", signal: controller.signal })
      .then((body) => setCredentials(body.credentials.filter((credential) => credential.connectorId === "slack")))
      .catch((caughtError: unknown) => { if (!controller.signal.aborted) setError(safeError(caughtError, "Integration credentials could not be loaded.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedWorkspaceId]);

  async function refresh() { if (!selectedWorkspaceId) return; const body = await apiRequest<{ credentials: Credential[] }>(`/api/integration-credentials?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`, { cache: "no-store" }); setCredentials(body.credentials.filter((credential) => credential.connectorId === "slack")); }
  async function create(name: string, apiToken: string) { if (!selectedWorkspaceId) return; setError(null); await apiRequest("/api/integration-credentials", { body: JSON.stringify({ connectorId: "slack", name, secret: { apiToken }, workspaceId: selectedWorkspaceId }), headers: { "content-type": "application/json" }, method: "POST" }); await refresh(); setMessage("Credential saved. Flowyn will never display the token again."); }
  async function rotate() { if (!rotateTarget || !rotateToken) return; setPending(true); setError(null); try { await apiRequest(`/api/integration-credentials/${encodeURIComponent(rotateTarget.id)}/rotate`, { body: JSON.stringify({ secret: { apiToken: rotateToken } }), headers: { "content-type": "application/json" }, method: "POST" }); setRotateTarget(null); setRotateToken(""); await refresh(); setMessage("Credential rotated."); } catch (caughtError) { setError(safeError(caughtError, "Credential could not be rotated.")); } finally { setPending(false); } }
  async function revoke() { if (!revokeTarget) return; setPending(true); setError(null); try { await apiRequest(`/api/integration-credentials/${encodeURIComponent(revokeTarget.id)}`, { method: "DELETE" }); setRevokeTarget(null); await refresh(); setMessage("Credential revoked."); } catch (caughtError) { setError(safeError(caughtError, "Credential could not be revoked.")); } finally { setPending(false); } }

  return <div className="space-y-8"><header><p className="text-sm font-semibold uppercase tracking-[0.16em] text-fuchsia-600">Integrations</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">Connect Slack safely.</h1><p className="mt-3 max-w-2xl text-slate-500">This surface exposes the existing Slack-only outbound connector. Tokens stay encrypted and never enter workflow data, queues, AI prompts, audit metadata, or browser responses.</p></header>{message ? <InlineAlert tone="success">{message}</InlineAlert> : null}{error ? <InlineAlert title="Integration operation unavailable" tone="error">{error}</InlineAlert> : null}{!selectedWorkspace ? <EmptyState title="Select a workspace first" description="Credentials are encrypted and isolated within the selected workspace." /> : <>{canManage ? <CredentialForm disabled={false} onSubmit={create} /> : <InlineAlert tone="info" title="Read-only integration role">Members can view safe credential status. Creating, rotating, and revoking remain management actions.</InlineAlert>}{loading ? <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-32" label="Loading integration credential" /><Skeleton className="h-32" label="Loading integration credential" /></div> : <CredentialList canManage={canManage} credentials={credentials} onRevoke={(credential) => setRevokeTarget(credential)} onRotate={(credential) => { setRotateTarget(credential); setRotateToken(""); }} />}</>}{rotateTarget ? <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4"><form aria-label="Rotate Slack token" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-950" onSubmit={(event) => { event.preventDefault(); void rotate(); }}><h2 className="text-lg font-semibold">Rotate {rotateTarget.name}</h2><p className="mt-2 text-sm text-slate-500">The replacement token is sent only to the authenticated server and is cleared after submission.</p><FormField className="mt-5" htmlFor="rotate-slack-token" label="Replacement Slack token"><Input autoComplete="new-password" id="rotate-slack-token" onChange={(event) => setRotateToken(event.target.value)} required type="password" value={rotateToken} /></FormField><div className="mt-6 flex justify-end gap-2"><Button onClick={() => setRotateTarget(null)} type="button" variant="outline">Cancel</Button><Button disabled={pending} type="submit">Rotate token</Button></div></form></div> : null}<ConfirmDialog confirmLabel="Revoke credential" description={revokeTarget ? `Revoke ${revokeTarget.name}? Existing workflows will no longer be able to use this credential.` : ""} onCancel={() => setRevokeTarget(null)} onConfirm={() => void revoke()} open={Boolean(revokeTarget)} pending={pending} title="Revoke integration credential" destructive /></div>;
}
