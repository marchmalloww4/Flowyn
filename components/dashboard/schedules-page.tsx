"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CalendarClock } from "lucide-react";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiRequest, FlowynClientError } from "@/lib/client/api";
import { canManageSchedules, filterWorkspaceSchedules, scheduleStatusLabel, type ScheduleRecord } from "@/lib/client/schedules-state";

type Workflow = { id: string; workspaceId: string; name: string; enabled: boolean };
type Schedule = ScheduleRecord & { workflowId: string; type: "CRON" | "INTERVAL" | "ONE_TIME"; cronExpression: string | null; intervalSeconds: number | null; runAt: string | null; timezone: string; misfirePolicy: "SKIP" | "FIRE_ONCE"; nextRunAt: string | null; lastProcessedAt: string | null; lastTriggeredAt: string | null };
type Occurrence = { id: string; scheduledFor: string; status: string; reasonCode: string | null };

function safeError(error: unknown, fallback: string) { return error instanceof FlowynClientError ? error.details.message : fallback; }
function displayDate(value: string | null) { return value ? new Date(value).toLocaleString() : "—"; }

export function SchedulesPage() {
  const { selectedMembership, selectedWorkspace, selectedWorkspaceId } = useWorkspace();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [occurrences, setOccurrences] = useState<Record<string, Occurrence[]>>({});
  const [workflowId, setWorkflowId] = useState("");
  const [type, setType] = useState<Schedule["type"]>("CRON");
  const [cronExpression, setCronExpression] = useState("15 10 * * 1-5");
  const [intervalSeconds, setIntervalSeconds] = useState("3600");
  const [runAt, setRunAt] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [misfirePolicy, setMisfirePolicy] = useState<Schedule["misfirePolicy"]>("SKIP");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManage = canManageSchedules(selectedMembership?.role);

  useEffect(() => {
    const controller = new AbortController();
    setWorkflows([]); setSchedules([]); setOccurrences({}); setWorkflowId(""); setEditingId(null); setMessage(null); setError(null);
    if (!selectedWorkspaceId) return () => controller.abort();
    setLoading(true);
    void Promise.all([
      apiRequest<{ workflows: Workflow[] }>(`/api/workflows?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`, { cache: "no-store", signal: controller.signal }),
      apiRequest<{ schedules: Schedule[] }>(`/api/workflow-schedules?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`, { cache: "no-store", signal: controller.signal }),
    ]).then(([workflowBody, scheduleBody]) => {
      setWorkflows(workflowBody.workflows.filter((workflow) => workflow.workspaceId === selectedWorkspaceId));
      setSchedules(filterWorkspaceSchedules(scheduleBody.schedules, selectedWorkspaceId) as Schedule[]);
      setWorkflowId(workflowBody.workflows[0]?.id ?? "");
    }).catch((caughtError: unknown) => { if (!controller.signal.aborted) setError(safeError(caughtError, "Schedules could not be loaded.")); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selectedWorkspaceId]);

  async function refreshSchedules() {
    if (!selectedWorkspaceId) return;
    const body = await apiRequest<{ schedules: Schedule[] }>(`/api/workflow-schedules?workspaceId=${encodeURIComponent(selectedWorkspaceId)}`, { cache: "no-store" });
    setSchedules(filterWorkspaceSchedules(body.schedules, selectedWorkspaceId) as Schedule[]);
  }
  function resetForm() { setEditingId(null); setType("CRON"); setCronExpression("15 10 * * 1-5"); setIntervalSeconds("3600"); setRunAt(""); setTimezone("UTC"); setMisfirePolicy("SKIP"); }
  function edit(schedule: Schedule) { setEditingId(schedule.id); setType(schedule.type); setCronExpression(schedule.cronExpression ?? "15 10 * * 1-5"); setIntervalSeconds(String(schedule.intervalSeconds ?? 3600)); setRunAt(schedule.runAt ? new Date(schedule.runAt).toISOString().slice(0, 16) : ""); setTimezone(schedule.timezone); setMisfirePolicy(schedule.misfirePolicy); setWorkflowId(schedule.workflowId); }
  function scheduleBody() { return { cronExpression: type === "CRON" ? cronExpression : null, input: {}, intervalSeconds: type === "INTERVAL" ? Number(intervalSeconds) : null, misfirePolicy, runAt: type === "ONE_TIME" && runAt ? new Date(runAt).toISOString() : null, timezone, type }; }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedWorkspaceId || !workflowId || !canManage) return;
    setPending(true); setError(null);
    const wasEditing = Boolean(editingId);
    try {
      if (editingId) await apiRequest(`/api/workflow-schedules/${encodeURIComponent(editingId)}`, { body: JSON.stringify(scheduleBody()), headers: { "content-type": "application/json" }, method: "PATCH" });
      else await apiRequest("/api/workflow-schedules", { body: JSON.stringify({ schedule: scheduleBody(), workflowId, workspaceId: selectedWorkspaceId }), headers: { "content-type": "application/json" }, method: "POST" });
      await refreshSchedules(); resetForm(); setMessage(wasEditing ? "Schedule updated." : "Schedule created.");
    } catch (caughtError) { setError(safeError(caughtError, "Schedule could not be saved.")); } finally { setPending(false); }
  }
  async function toggle(schedule: Schedule) { setPending(true); try { await apiRequest(`/api/workflow-schedules/${encodeURIComponent(schedule.id)}/${schedule.enabled ? "disable" : "enable"}`, { method: "POST" }); await refreshSchedules(); setMessage(schedule.enabled ? "Schedule disabled." : "Schedule enabled."); } catch (caughtError) { setError(safeError(caughtError, "Schedule could not be updated.")); } finally { setPending(false); } }
  async function loadHistory(schedule: Schedule) { try { const body = await apiRequest<{ occurrences: Occurrence[] }>(`/api/workflow-schedules/${encodeURIComponent(schedule.id)}/occurrences`, { cache: "no-store" }); setOccurrences((current) => ({ ...current, [schedule.id]: body.occurrences })); } catch (caughtError) { setError(safeError(caughtError, "Schedule history could not be loaded.")); } }
  async function remove() { if (!deleteTarget) return; setPending(true); try { await apiRequest(`/api/workflow-schedules/${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" }); setDeleteTarget(null); await refreshSchedules(); setMessage("Schedule deleted."); } catch (caughtError) { setError(safeError(caughtError, "Schedule could not be deleted.")); } finally { setPending(false); } }

  return (
    <div className="space-y-8">
      <header><p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-600">Schedules</p><h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">Put durable work on a clock.</h1><p className="mt-3 max-w-2xl text-slate-500">Use bounded CRON, interval, and one-time schedules with explicit misfire behavior.</p></header>
      {message ? <InlineAlert tone="success">{message}</InlineAlert> : null}
      {error ? <InlineAlert title="Schedule operation unavailable" tone="error">{error}</InlineAlert> : null}
      {!selectedWorkspace ? <EmptyState title="Select a workspace first" description="Schedules are workspace-scoped and server-authorized." /> : <>
        {canManage ? <form className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950" onSubmit={(event) => void save(event)}><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{editingId ? "Edit schedule" : "Create schedule"}</h2><p className="mt-1 text-sm text-slate-500">Misfires remain bounded by the existing scheduler policy.</p></div>{editingId ? <Button onClick={resetForm} type="button" variant="outline">Cancel</Button> : null}</div><div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="space-y-2"><label className="block text-sm font-medium" htmlFor="schedule-workflow">Workflow</label><select className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm" disabled={Boolean(editingId)} id="schedule-workflow" onChange={(event) => setWorkflowId(event.target.value)} value={workflowId}><option value="">Select workflow</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}</select></div><div className="space-y-2"><label className="block text-sm font-medium" htmlFor="schedule-type">Schedule type</label><select className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm" id="schedule-type" onChange={(event) => setType(event.target.value as Schedule["type"])} value={type}><option value="CRON">CRON</option><option value="INTERVAL">Interval</option><option value="ONE_TIME">One time</option></select></div></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><FormField htmlFor="schedule-timezone" label="IANA timezone"><Input id="schedule-timezone" onChange={(event) => setTimezone(event.target.value)} value={timezone} /></FormField>{type === "CRON" ? <FormField htmlFor="schedule-cron" label="Five-field CRON"><Input id="schedule-cron" onChange={(event) => setCronExpression(event.target.value)} value={cronExpression} /></FormField> : type === "INTERVAL" ? <FormField htmlFor="schedule-interval" label="Interval seconds"><Input id="schedule-interval" min={60} onChange={(event) => setIntervalSeconds(event.target.value)} type="number" value={intervalSeconds} /></FormField> : <FormField htmlFor="schedule-run-at" label="Run at"><Input id="schedule-run-at" onChange={(event) => setRunAt(event.target.value)} type="datetime-local" value={runAt} /></FormField>}</div><div className="mt-4 space-y-2"><label className="block text-sm font-medium" htmlFor="schedule-misfire">Misfire policy</label><select className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm" id="schedule-misfire" onChange={(event) => setMisfirePolicy(event.target.value as Schedule["misfirePolicy"])} value={misfirePolicy}><option value="SKIP">Skip missed occurrence</option><option value="FIRE_ONCE">Fire once</option></select></div><Button className="mt-5" disabled={pending || !workflowId} type="submit">{editingId ? "Update schedule" : "Create schedule"}</Button></form> : <InlineAlert tone="info" title="Read-only schedule role">Members can view schedule state and history. Schedule changes remain management actions.</InlineAlert>}
        {loading ? <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-40" label="Loading schedule" /><Skeleton className="h-40" label="Loading schedule" /></div> : schedules.length === 0 ? <EmptyState title="No schedules yet" description={canManage ? "Create a schedule for an existing workflow." : "A workspace administrator can create a schedule."} /> : <div className="space-y-4">{schedules.map((schedule) => { const history = occurrences[schedule.id]; const workflow = workflows.find((candidate) => candidate.id === schedule.workflowId); return <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950" key={schedule.id}><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><CalendarClock aria-hidden className="mt-0.5 h-5 w-5 text-violet-600" /><div><h2 className="font-semibold">{workflow?.name ?? "Workflow"}</h2><p className="mt-1 text-sm text-slate-500">{schedule.type} · {schedule.timezone} · next {displayDate(schedule.nextRunAt)}</p></div></div><StatusBadge tone={schedule.enabled ? "success" : "neutral"}>{scheduleStatusLabel(schedule.enabled)}</StatusBadge></div><p className="mt-3 text-xs text-slate-500">Last processed {displayDate(schedule.lastProcessedAt)} · last triggered {displayDate(schedule.lastTriggeredAt)}</p><div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => void loadHistory(schedule)} size="sm" variant="outline">History</Button>{canManage ? <><Button disabled={pending} onClick={() => edit(schedule)} size="sm" variant="outline">Edit</Button><Button disabled={pending} onClick={() => void toggle(schedule)} size="sm" variant="outline">{schedule.enabled ? "Disable" : "Enable"}</Button><Button disabled={pending} onClick={() => setDeleteTarget(schedule)} size="sm" variant="outline">Delete</Button></> : null}</div>{history ? <div className="mt-4 space-y-2 border-t pt-4">{history.length === 0 ? <p className="text-xs text-slate-500">No occurrences yet.</p> : history.map((occurrence) => <p className="text-xs text-slate-500" key={occurrence.id}>{occurrence.status} · {displayDate(occurrence.scheduledFor)}{occurrence.reasonCode ? ` · ${occurrence.reasonCode}` : ""}</p>)}</div> : null}</article>; })}</div>}
      </>}
      {deleteTarget ? <ConfirmDialog confirmLabel="Delete schedule" description="Delete this schedule? Durable workflow history is not changed." onCancel={() => setDeleteTarget(null)} onConfirm={() => void remove()} open pending={pending} title="Delete schedule" destructive /> : null}
    </div>
  );
}
