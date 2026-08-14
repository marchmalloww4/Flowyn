"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Workspace = { id: string; name: string };
type Brand = { id: string; name: string };
type Agent = {
  id: string;
  workspaceId: string;
  brandId: string | null;
  name: string;
  description: string;
  systemInstructions: string;
  allowedTools: string[];
  enabled: boolean;
  maxSteps: number;
  deletedAt: string | null;
};
type AgentRun = { runId: string; status: string; stepCount: number; finalResponse: string | null; errorCode: string | null };
type RunStep = { id: string; stepNumber: number; type: string; toolName: string | null; status: string; safeOutputMetadata: Record<string, unknown>; errorCode: string | null };
type ErrorBody = { error?: { message?: string } };

const toolCatalog = [
  { name: "search_brand_knowledge", description: "Search the selected brand's indexed knowledge.", requiresBrand: true },
  { name: "get_brand_profile", description: "Read the selected brand profile.", requiresBrand: true },
];

async function readResponse<T>(response: Response): Promise<T> {
  const body = response.status === 204 ? undefined : await response.json() as T & ErrorBody;
  if (!response.ok) throw new Error((body as ErrorBody | undefined)?.error?.message ?? "Request failed.");
  return body as T;
}

export function AgentPanel() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemInstructions, setSystemInstructions] = useState("");
  const [allowedTools, setAllowedTools] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [maxSteps, setMaxSteps] = useState(5);
  const [goals, setGoals] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState<Record<string, AgentRun>>({});
  const [steps, setSteps] = useState<Record<string, RunStep[]>>({});
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadWorkspaces() {
    const body = await readResponse<{ workspaces: Array<{ workspace: Workspace }> }>(await fetch("/api/workspaces", { cache: "no-store" }));
    const next = body.workspaces.map((entry) => entry.workspace);
    setWorkspaces(next);
    setWorkspaceId((current) => current || next[0]?.id || "");
  }

  async function loadWorkspaceData(nextWorkspaceId: string) {
    if (!nextWorkspaceId) {
      setBrands([]);
      setAgents([]);
      return;
    }
    const [brandBody, agentBody] = await Promise.all([
      readResponse<{ brands: Brand[] }>(await fetch(`/api/brands?workspaceId=${encodeURIComponent(nextWorkspaceId)}`, { cache: "no-store" })),
      readResponse<{ agents: Agent[] }>(await fetch(`/api/agents?workspaceId=${encodeURIComponent(nextWorkspaceId)}`, { cache: "no-store" })),
    ]);
    setBrands(brandBody.brands);
    setAgents(agentBody.agents);
  }

  useEffect(() => { void loadWorkspaces().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load workspaces.")); }, []);
  useEffect(() => { setBrandId(""); void loadWorkspaceData(workspaceId).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load agents.")); }, [workspaceId]);

  function resetForm() {
    setEditingId(null); setName(""); setDescription(""); setSystemInstructions(""); setAllowedTools([]); setEnabled(true); setMaxSteps(5);
  }

  function editAgent(agent: Agent) {
    setEditingId(agent.id); setName(agent.name); setDescription(agent.description); setSystemInstructions(agent.systemInstructions); setAllowedTools(agent.allowedTools); setEnabled(agent.enabled); setMaxSteps(agent.maxSteps); setBrandId(agent.brandId ?? "");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId) return setError("Select a workspace first.");
    setPending(true); setError(null); setMessage(null);
    try {
      const payload = { name, description, systemInstructions, allowedTools, enabled, maxSteps, ...(editingId ? { brandId: brandId || null } : { workspaceId, ...(brandId ? { brandId } : {}) }) };
      await readResponse(await fetch(editingId ? `/api/agents/${editingId}` : "/api/agents", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
      await loadWorkspaceData(workspaceId); resetForm(); setMessage(editingId ? "Agent updated." : "Agent created.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save agent."); } finally { setPending(false); }
  }

  async function removeAgent(agentId: string) {
    setPending(true); setError(null);
    try { await readResponse(await fetch(`/api/agents/${agentId}`, { method: "DELETE" })); await loadWorkspaceData(workspaceId); setMessage("Agent deleted."); if (editingId === agentId) resetForm(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete agent."); } finally { setPending(false); }
  }

  async function run(agent: Agent) {
    const goal = goals[agent.id]?.trim() ?? "";
    if (!goal) return setError("Enter a goal before running an agent.");
    setPending(true); setError(null); setMessage(null);
    try {
      const body = await readResponse<{ run: AgentRun }>(await fetch(`/api/agents/${agent.id}/runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal }) }));
      setRuns((current) => ({ ...current, [agent.id]: body.run }));
      const history = await readResponse<{ steps: RunStep[] }>(await fetch(`/api/agent-runs/${body.run.runId}`, { cache: "no-store" }));
      setSteps((current) => ({ ...current, [agent.id]: history.steps }));
      setMessage(`Run ${body.run.status.toLowerCase()}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not run agent."); } finally { setPending(false); }
  }

  return <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
    <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold">Agents</p><p className="mt-1 text-sm text-slate-500">Run bounded, workspace-scoped agents with a server-controlled tool set.</p></div><span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">Milestone 5</span></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="agent-workspace">Workspace</Label><select id="agent-workspace" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm"><option value="">Select workspace</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="agent-brand">Optional brand context</Label><select id="agent-brand" value={brandId} onChange={(event) => setBrandId(event.target.value)} disabled={!workspaceId} className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm"><option value="">No brand</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></div></div>
    <form onSubmit={save} className="mt-5 space-y-3 rounded-2xl border border-dashed border-slate-300 p-4 dark:border-slate-700"><div className="flex items-center justify-between"><p className="text-sm font-semibold">{editingId ? "Edit agent" : "New agent"}</p>{editingId && <Button type="button" variant="ghost" size="sm" onClick={resetForm}>Cancel</Button>}</div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="agent-name">Name</Label><Input id="agent-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Research agent" required /></div><div className="space-y-2"><Label htmlFor="agent-max-steps">Maximum steps</Label><Input id="agent-max-steps" type="number" min={1} max={12} value={maxSteps} onChange={(event) => setMaxSteps(Number(event.target.value))} required /></div></div><div className="space-y-2"><Label htmlFor="agent-description">Description</Label><Input id="agent-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What this agent is for" /></div><div className="space-y-2"><Label htmlFor="agent-instructions">System instructions</Label><textarea id="agent-instructions" value={systemInstructions} onChange={(event) => setSystemInstructions(event.target.value)} placeholder="Give the agent a concise operating brief." className="min-h-24 w-full rounded-2xl border bg-transparent px-4 py-3 text-sm" /></div><fieldset><legend className="text-sm font-medium">Allowed tools</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{toolCatalog.map((tool) => <label key={tool.name} className="flex items-start gap-2 rounded-xl border p-3 text-sm"><input type="checkbox" checked={allowedTools.includes(tool.name)} onChange={(event) => setAllowedTools((current) => event.target.checked ? [...current, tool.name] : current.filter((nameValue) => nameValue !== tool.name))} /><span><span className="block font-medium">{tool.name}</span><span className="block text-xs text-slate-500">{tool.description}{tool.requiresBrand ? " Requires a trusted brand." : ""}</span></span></label>)}</div></fieldset><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />Enabled for new runs</label><Button type="submit" disabled={pending || !workspaceId}>{pending ? "Saving..." : editingId ? "Update agent" : "Create agent"}</Button></form>
    <div className="mt-6 space-y-3">{agents.map((agent) => <article key={agent.id} className="rounded-2xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{agent.name}</p><p className="mt-1 text-sm text-slate-500">{agent.description || "No description."}</p></div><span className={`rounded-full px-2 py-1 text-xs ${agent.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{agent.enabled ? "Enabled" : "Disabled"}</span></div><p className="mt-3 text-xs text-slate-500">{agent.allowedTools.length ? `Tools: ${agent.allowedTools.join(", ")}` : "No tools configured"} · max {agent.maxSteps} steps</p><div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => editAgent(agent)} disabled={pending}>Edit</Button><Button type="button" variant="outline" size="sm" onClick={() => void removeAgent(agent.id)} disabled={pending}>Delete</Button></div><div className="mt-4 border-t pt-4"><Label htmlFor={`agent-goal-${agent.id}`}>Run goal</Label><textarea id={`agent-goal-${agent.id}`} value={goals[agent.id] ?? ""} onChange={(event) => setGoals((current) => ({ ...current, [agent.id]: event.target.value }))} placeholder="Ask this agent to find a bounded fact..." className="mt-2 min-h-20 w-full rounded-2xl border bg-transparent px-4 py-3 text-sm" /><Button type="button" className="mt-2" onClick={() => void run(agent)} disabled={pending || !agent.enabled}>Run synchronously</Button></div>{runs[agent.id] && <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-900"><p className="font-semibold">Run: {runs[agent.id]?.status}</p><p className="mt-1 text-xs text-slate-500">{runs[agent.id]?.stepCount} step(s)</p>{runs[agent.id]?.finalResponse && <p className="mt-3 whitespace-pre-wrap">{runs[agent.id]?.finalResponse}</p>}{runs[agent.id]?.errorCode && <p className="mt-2 text-xs text-red-600">{runs[agent.id]?.errorCode}</p>}{steps[agent.id] && <div className="mt-3 space-y-2">{steps[agent.id]?.map((step) => <div key={step.id} className="rounded-xl border bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-950"><p className="font-semibold">Step {step.stepNumber}: {step.type}{step.toolName ? ` · ${step.toolName}` : ""}</p><p className="mt-1 text-slate-500">{step.status}{step.errorCode ? ` · ${step.errorCode}` : ""}</p>{Object.keys(step.safeOutputMetadata).length > 0 && <p className="mt-1 text-slate-500">{JSON.stringify(step.safeOutputMetadata)}</p>}</div>)}</div>}</div>}</article>)}{workspaceId && agents.length === 0 && <p className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">No agents in this workspace yet.</p>}</div>{message && <p role="status" className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">{message}</p>}{error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
  </section>;
}
