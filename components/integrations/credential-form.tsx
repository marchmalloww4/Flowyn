"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CredentialForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (name: string, apiToken: string) => Promise<void> }) {
  const [name, setName] = useState("Slack workspace token");
  const [apiToken, setApiToken] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try { await onSubmit(name, apiToken); setApiToken(""); } finally { setPending(false); }
  }
  if (disabled) return <p className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">Members can view integration status but cannot create, rotate, or revoke credentials.</p>;
  return <form onSubmit={(event) => void submit(event)} className="space-y-3 rounded-2xl border border-dashed border-slate-300 p-4 dark:border-slate-700"><p className="text-sm font-semibold">Add Slack credential</p><Input aria-label="Credential name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Credential name" required /><Input aria-label="Slack API token" type="password" autoComplete="new-password" value={apiToken} onChange={(event) => setApiToken(event.target.value)} placeholder="Paste the Slack token" required /><p className="text-xs text-slate-500">The token is sent only to the authenticated server and is cleared after submission.</p><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save credential"}</Button></form>;
}
