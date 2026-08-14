"use client";

import { Button } from "@/components/ui/button";
import { integrationCredentialStatus } from "@/lib/integrations/ui";

export type Credential = { id: string; connectorId: string; name: string; secretVersion: number; createdAt?: string; updatedAt?: string; revokedAt: string | null; deletedAt?: string | null; lastUsedAt: string | null };

export function CredentialList({ credentials, canManage, onRotate, onRevoke }: { credentials: Credential[]; canManage: boolean; onRotate: (credential: Credential) => void; onRevoke: (credential: Credential) => void }) {
  if (credentials.length === 0) return <p className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">No integration credentials in this workspace yet.</p>;
  return <div className="space-y-3">{credentials.map((credential) => <article key={credential.id} className="rounded-2xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{credential.name}</p><p className="mt-1 text-xs text-slate-500">{credential.connectorId} · secret version {credential.secretVersion}</p><p className="mt-1 text-xs text-slate-500">Last used: {credential.lastUsedAt ? new Date(credential.lastUsedAt).toLocaleString() : "Never"}</p></div><span className={`rounded-full px-2 py-1 text-xs ${integrationCredentialStatus(credential) === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{integrationCredentialStatus(credential)}</span></div>{canManage && integrationCredentialStatus(credential) === "Active" && <div className="mt-3 flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => onRotate(credential)}>Rotate token</Button><Button type="button" variant="ghost" size="sm" onClick={() => onRevoke(credential)}>Revoke</Button></div>}</article>)}</div>;
}
