"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Bot, Play, Trash2 } from "lucide-react";
import { AGENT_TOOL_CATALOG } from "@/lib/agents/catalog";
import { apiRequest, FlowynClientError } from "@/lib/client/api";
import { agentRunHistoryPath, agentRunStatus, canManageAgents, filterWorkspaceAgents, parseAgentRunResponse, toAgentPlainText } from "@/lib/client/agents-state";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";

type Brand = { id: string; workspaceId: string; name: string };
type Agent = { id: string; workspaceId: string; brandId: string | null; name: string; description: string; systemInstructions: string; allowedTools: string[]; enabled: boolean; maxSteps: number; deletedAt: string | null };
type Run = { id: string; status: string; stepCount: number; finalResponse: string | null; errorCode: string | null; goal?: string };
type RunHistory = { run: Run; steps: Array<{ id: string; stepNumber: number; type: string; toolName: string | null; status: string; errorCode: string | null }> };

function safeError(error: unknown, fallback: string) { return error instanceof FlowynClientError ? error.details.message : fallback; }
function safeRunHistory(history: RunHistory): RunHistory { return { ...history, run: { ...history.run, finalResponse: history.run.finalResponse ? toAgentPlainText(history.run.finalResponse) : history.run.finalResponse } }; }

export function AgentsPage() {
  const { selectedMembership, selectedWorkspace, selectedWorkspaceId } = useWorkspace();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [brandId, setBrandId] = useState("");
  const [allowedTools, setAllowedTools] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [maxSteps, setMaxSteps] = useState(5);
  const [goals, setGoals] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState<Record<string, RunHistory>>({});
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManage = canManageAgents(selectedMembership?.role);

  useEffect(() => {
    const controller = new AbortController();
    setBrands([]); setAgents([]); setRuns({}); setEditingId(null); setMessage(null); setError(null);
    if (!selectedWorkspaceId) return () => controller.abort();
    setLoading(true);
    void Promise.all([
      apiRequest<{ brands: Brand[] }>(`/api/brands?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`, { cache: "no-store", signal: controller.signal }),
      apiRequest<{ agents: Agent[] }>(`/api/agents?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`, { cache: "no-store", signal: controller.signal }),
    ]).then(([brandBody, agentBody]) => {
      setBrands(brandBody.brands.filter((brand) => brand.workspaceId === selectedWorkspaceId));
      setAgents(filterWorkspaceAgents(agentBody.agents, selectedWorkspaceId) as Agent[]);
    }).catch((caughtError: unknown) => { if (!controller.signal.aborted) setError(safeError(caughtError, "Agents could not be loaded.")); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedWorkspaceId]);

  function resetForm() { setEditingId(null); setName(""); setDescription(""); setInstructions(""); setBrandId(""); setAllowedTools([]); setEnabled(true); setMaxSteps(5); }
  function editAgent(agent: Agent) { setEditingId(agent.id); setName(agent.name); setDescription(agent.description); setInstructions(agent.systemInstructions); setBrandId(agent.brandId ?? ""); setAllowedTools(agent.allowedTools); setEnabled(agent.enabled); setMaxSteps(agent.maxSteps); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedWorkspaceId || !canManage) return;
    setPending(true); setError(null); setMessage(null);
    const payload = { allowedTools, brandId: brandId || null, description, enabled, maxSteps, name, systemInstructions: instructions, ...(editingId ? {} : { workspaceId: selectedWorkspaceId }) };
    try { await apiRequest(editingId ? `/api/agents/${encodeURIComponent(editingId)}` : "/api/agents", { body: JSON.stringify(payload), headers: { "content-type": "application/json" }, method: editingId ? "PATCH" : "POST" }); await refreshAgents(); resetForm(); setMessage(editingId ? "Agent updated." : "Agent created."); }
    catch (caughtError) { setError(safeError(caughtError, "Agent could not be saved.")); } finally { setPending(false); }
  }

  async function refreshAgents() { if (!selectedWorkspaceId) return; const body = await apiRequest<{ agents: Agent[] }>(`/api/agents?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`, { cache: "no-store" }); setAgents(filterWorkspaceAgents(body.agents, selectedWorkspaceId) as Agent[]); }
  async function removeAgent() { if (!deleteTarget) return; setPending(true); setError(null); try { await apiRequest(`/api/agents/${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" }); setDeleteTarget(null); await refreshAgents(); setMessage("Agent deleted."); } catch (caughtError) { setError(safeError(caughtError, "Agent could not be deleted.")); } finally { setPending(false); } }

  async function runAgent(agent: Agent) {
    const goal = goals[agent.id]?.trim(); if (!goal) { setError("Enter a goal before running an agent."); return; }
    setPending(true); setError(null); setMessage(null);
    const key = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `agent-${Date.now()}`;
    try {
      const body = parseAgentRunResponse(await apiRequest<unknown>(`/api/agents/${encodeURIComponent(agent.id)}/runs`, { body: JSON.stringify({ goal }), headers: { "content-type": "application/json", "idempotency-key": key }, method: "POST" }));
      const history = safeRunHistory(await apiRequest<RunHistory>(agentRunHistoryPath(body.run.runId), { cache: "no-store" }));
      setRuns((current) => ({ ...current, [agent.id]: history })); setMessage(`Agent run ${agentRunStatus(history.run.status).toLowerCase()}.`);
    } catch (caughtError) {
      if (caughtError instanceof FlowynClientError && caughtError.details.runId) {
        try { const history = safeRunHistory(await apiRequest<RunHistory>(agentRunHistoryPath(caughtError.details.runId), { cache: "no-store" })); setRuns((current) => ({ ...current, [agent.id]: history })); } catch { /* Preserve the original safe error. */ }
      }
      setError(safeError(caughtError, "Agent run could not be completed."));
    } finally { setPending(false); }
  }

  return <div className="space-y-8"><header><p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-600">Agents</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">Keep agents controlled.</h1><p className="mt-3 max-w-2xl text-slate-500">Define workspace-scoped assistants with bounded tools and review each result inside Flowyn.</p></header>{message ? <InlineAlert tone="success">{message}</InlineAlert> : null}{error ? <InlineAlert title="Agent operation unavailable" tone="error">{error}</InlineAlert> : null}{!selectedWorkspace ? <EmptyState title="Select a workspace first" description="Agent definitions and runs are always workspace-scoped." /> : <>{canManage ? <form className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950" onSubmit={(event) => void save(event)}><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{editingId ? "Edit agent" : "Create agent"}</h2><p className="mt-1 text-sm text-slate-500">Only tools from Flowyn&apos;s controlled registry can be selected.</p></div>{editingId ? <Button onClick={resetForm} type="button" variant="outline">Cancel</Button> : null}</div><div className="mt-5 grid gap-4 sm:grid-cols-2"><FormField description="Give this AI assistant a name that describes its job. Example: SweetBites Marketing Assistant" htmlFor="agent-name" label="Agent name"><Input id="agent-name" onChange={(event) => setName(event.target.value)} placeholder="SweetBites Marketing Assistant" required value={name} /></FormField><FormField description="Limit how many bounded steps this assistant can take." htmlFor="agent-steps" label="Maximum steps"><Input id="agent-steps" max={12} min={1} onChange={(event) => setMaxSteps(Number(event.target.value))} required type="number" value={maxSteps} /></FormField></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><FormField description="Optional note that helps people recognize this assistant." htmlFor="agent-description" label="Description"><Input id="agent-description" onChange={(event) => setDescription(event.target.value)} value={description} /></FormField><div className="space-y-2"><label className="block text-sm font-medium" htmlFor="agent-brand">Brand context</label><p className="text-xs text-slate-500">These tools use your saved brand information. Select a brand first.</p><select className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm" id="agent-brand" onChange={(event) => { const nextBrandId = event.target.value; setBrandId(nextBrandId); if (!nextBrandId) setAllowedTools((current) => current.filter((name) => !AGENT_TOOL_CATALOG.some((tool) => tool.name === name && tool.requiresBrand))); }} value={brandId}><option value="">No brand</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></div></div><FormField className="mt-4" description="Describe the assistant's reusable job, responsibilities, and rules. Instructions are reused across runs; a goal describes what one run should accomplish." htmlFor="agent-instructions" label="Instructions for your AI"><textarea className="min-h-24 w-full rounded-2xl border bg-transparent px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500" id="agent-instructions" onChange={(event) => setInstructions(event.target.value)} value={instructions} /></FormField><fieldset className="mt-4"><legend className="text-sm font-medium">Allowed tools</legend><p className="mt-1 text-xs text-slate-500">Tools are bounded capabilities. They do not publish content or send messages.</p><div className="mt-2 grid gap-2 md:grid-cols-2">{AGENT_TOOL_CATALOG.map((tool) => { const disabled = tool.requiresBrand && !brandId; return <label className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${disabled ? "opacity-60" : ""}`} key={tool.name}><input checked={allowedTools.includes(tool.name)} disabled={disabled} onChange={(event) => setAllowedTools((current) => event.target.checked ? [...current, tool.name] : current.filter((item) => item !== tool.name))} type="checkbox" /><span><span className="block font-medium">{tool.label}</span><span className="block text-xs text-slate-500">{tool.description}</span>{disabled ? <span className="mt-1 block text-xs text-slate-500">Select a brand to enable this tool.</span> : null}</span></label>; })}</div></fieldset><label className="mt-4 flex items-center gap-2 text-sm"><input checked={enabled} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" />Enabled for new runs</label><Button className="mt-5" disabled={pending} type="submit">{pending ? "Saving…" : editingId ? "Update agent" : "Create agent"}</Button></form> : <InlineAlert tone="info" title="Read-only role">Members can run enabled agents, while agent management is limited by the existing workspace action map.</InlineAlert>}{loading ? <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-48" label="Loading agent" /><Skeleton className="h-48" label="Loading agent" /></div> : agents.length === 0 ? <EmptyState title="No agents yet" description={canManage ? "Create a controlled assistant, then give it a bounded goal." : "A workspace administrator can create an agent."} /> : <div className="grid gap-5 lg:grid-cols-2">{agents.map((agent) => { const history = runs[agent.id]; const usedTools = [...new Set(history?.steps.filter((step) => step.type === "TOOL_CALL" && step.status === "SUCCEEDED" && step.toolName).map((step) => AGENT_TOOL_CATALOG.find((tool) => tool.name === step.toolName)?.label ?? "Controlled tool") ?? [])]; return <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950" key={agent.id}><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><Bot aria-hidden className="mt-0.5 h-5 w-5 text-violet-600" /><div><h2 className="font-semibold">{agent.name}</h2><p className="mt-1 text-sm text-slate-500">{agent.description || "No description."}</p></div></div><StatusBadge tone={agent.enabled ? "success" : "neutral"}>{agent.enabled ? "Enabled" : "Disabled"}</StatusBadge></div><p className="mt-4 text-xs text-slate-500">{agent.allowedTools.length ? `Tools: ${agent.allowedTools.map((name) => AGENT_TOOL_CATALOG.find((tool) => tool.name === name)?.label ?? "Controlled tool").join(", ")}` : "No tools configured"} · max {agent.maxSteps} steps</p><div className="mt-5 flex flex-wrap gap-2">{canManage ? <><Button onClick={() => editAgent(agent)} size="sm" variant="outline">Edit</Button><Button aria-label={`Delete ${agent.name}`} onClick={() => setDeleteTarget(agent)} size="sm" variant="outline"><Trash2 aria-hidden className="h-4 w-4" />Delete</Button></> : null}</div><div className="mt-5 border-t pt-4"><FormField description="A goal is what you want this run to accomplish. It does not change the assistant's reusable instructions." htmlFor={`agent-goal-${agent.id}`} label="Run goal"><textarea className="min-h-20 w-full rounded-2xl border bg-transparent px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500" id={`agent-goal-${agent.id}`} onChange={(event) => setGoals((current) => ({ ...current, [agent.id]: event.target.value }))} value={goals[agent.id] ?? ""} /></FormField><Button className="mt-3" disabled={pending || !agent.enabled} onClick={() => void runAgent(agent)} type="button"><Play aria-hidden className="h-4 w-4" />Run agent</Button></div>{history ? <div aria-live="polite" className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-900"><div className="flex items-center justify-between gap-3"><p className="font-semibold">Latest run</p><StatusBadge tone={history.run.status === "COMPLETED" ? "success" : history.run.status === "FAILED" ? "danger" : "info"}>{agentRunStatus(history.run.status)}</StatusBadge></div><p className="mt-2 text-xs text-slate-500">Status: {agentRunStatus(history.run.status)} · {history.run.stepCount} steps · Run ID {history.run.id}</p>{history.run.finalResponse ? <div className="mt-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Result</p><p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-words">{history.run.finalResponse}</p></div> : null}{history.run.errorCode ? <p className="mt-2 text-xs text-rose-700">This run could not finish: {history.run.errorCode}</p> : null}{usedTools.length ? <p className="mt-2 text-xs text-slate-500">Safe tools used: {usedTools.join(", ")}</p> : null}<Button className="mt-3" disabled={pending || !agent.enabled} onClick={() => void runAgent(agent)} size="sm" type="button" variant="outline">Run again</Button><p className="mt-3 text-xs text-slate-500">Running an agent creates a result inside Flowyn. It does not publish anything externally unless you use an approved workflow/integration.</p></div> : null}</article>; })}</div>}</>}{deleteTarget ? <ConfirmDialog confirmLabel="Delete agent" description={`Delete ${deleteTarget.name}? This uses the existing soft-delete behavior.`} onCancel={() => setDeleteTarget(null)} onConfirm={() => void removeAgent()} open pending={pending} title="Delete agent" destructive /> : null}</div>;
}
