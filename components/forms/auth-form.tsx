"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isSignUp = mode === "sign-up";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const endpoint = isSignUp ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email";
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(isSignUp ? { name, email, password } : { email, password }) });
    const body = await response.json().catch(() => null) as { message?: string; error?: { message?: string } } | null;
    setPending(false);
    if (!response.ok) {
      setError(body?.error?.message ?? body?.message ?? "Authentication failed.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {isSignUp && <div className="space-y-2"><Label htmlFor="name">Name</Label><Input id="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required /></div>}
      <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
      <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete={isSignUp ? "new-password" : "current-password"} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <Button className="w-full" type="submit" disabled={pending}>{pending ? "Working…" : isSignUp ? "Create account" : "Sign in"}</Button>
      <p className="text-center text-sm text-slate-500">{isSignUp ? "Already have an account?" : "Need an account?"} <Link className="font-semibold text-violet-600" href={isSignUp ? "/sign-in" : "/sign-up"}>{isSignUp ? "Sign in" : "Create one"}</Link></p>
    </form>
  );
}