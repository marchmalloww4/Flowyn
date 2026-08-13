import Link from "next/link";
import { AuthForm } from "@/components/forms/auth-form";

export default function SignUpPage() {
  return <main className="flex min-h-screen items-center justify-center px-6 py-12"><div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/30 dark:border-slate-700 dark:bg-slate-900"><Link href="/" className="text-sm font-semibold text-slate-500">← Flowyn home</Link><h1 className="mt-8 text-3xl font-semibold tracking-tight">Create your account</h1><p className="mt-2 text-sm text-slate-500">Start with a workspace you control locally.</p><div className="mt-8"><AuthForm mode="sign-up" /></div></div></main>;
}