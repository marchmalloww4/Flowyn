import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AgentPanel } from "@/components/forms/agent-panel";
import { AIGenerationPanel } from "@/components/forms/ai-generation-panel";
import { KnowledgePanel } from "@/components/forms/knowledge-panel";
import { WorkflowPanel } from "@/components/forms/workflow-panel";
import { WorkspaceBrandPanel } from "@/components/forms/workspace-brand-panel";
import { FlowynShell } from "@/components/flowyn-shell";
import { getSessionUser } from "@/lib/auth/session";

export default async function DashboardPage() {
  const currentUser = await getSessionUser(await headers());
  if (!currentUser) redirect("/sign-in");
  return <FlowynShell userEmail={currentUser.email}><div className="flex flex-col gap-8"><header><p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-600">Workspace overview</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">Build your first AI workforce.</h1><p className="mt-3 max-w-2xl text-slate-500">Milestone 6 adds durable, versioned workflows while preserving the existing workspace and brand boundaries.</p></header><div className="grid gap-4 md:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950"><p className="text-sm text-slate-500">Active workflows</p><p className="mt-3 text-3xl font-semibold">Durable</p><p className="mt-2 text-xs text-slate-400">Queued through PostgreSQL and BullMQ</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950"><p className="text-sm text-slate-500">Local AI provider</p><p className="mt-3 text-lg font-semibold">Ollama</p><p className="mt-2 text-xs text-emerald-600">Configured through environment</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950"><p className="text-sm text-slate-500">Knowledge status</p><p className="mt-3 text-lg font-semibold">pgvector</p><p className="mt-2 text-xs text-violet-600">Verified local embeddings</p></div></div><WorkspaceBrandPanel /><KnowledgePanel /><AgentPanel /><WorkflowPanel /><AIGenerationPanel /></div></FlowynShell>;
}
