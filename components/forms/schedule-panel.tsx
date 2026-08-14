"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Workspace = { id: string; name: string; role: "OWNER" | "ADMIN" | "MEMBER" };
type Workflow = { id: string; name: string; enabled: boolean };
type ScheduleType = "CRON" | "INTERVAL" | "ONE_TIME";
type MisfirePolicy = "SKIP" | "FIRE_ONCE";
type Schedule = {
  id: string;
  workspaceId: string;
  workflowId: string;
  type: ScheduleType;
  enabled: boolean;
  cronExpression: string | null;
  intervalSeconds: number | null;
  runAt: string | null;
  timezone: string;
  misfirePolicy: MisfirePolicy;
  nextRunAt: string | null;
  lastTriggeredAt: string | null;
  lastProcessedAt: string | null;
};
type Occurrence = { id: string; scheduledFor: string; status: string; reasonCode: string | null; workflowRunId: string | null };
type ErrorBody = { error?: { message?: string } };

export async function readScheduleResponse<T>(response: Response): Promise<T> {
  const body = response.status === 204 ? undefined : await response.json() as T & ErrorBody;
  if (!response.ok) throw new Error((body as ErrorBody | undefined)?.error?.message ?? "Request failed.");
  return body as T;
}

function displayDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

export function SchedulePanel() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [occurrences, setOccurrences] = useState<Record<string, Occurrence[]>>({});
  const [workspaceId, setWorkspaceId] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [type, setType] = useState<ScheduleType>("CRON");
  const [cronExpression, setCronExpression] = useState("15 10 * * *");
  const [intervalSeconds, setIntervalSeconds] = useState("3600");
  const [runAt, setRunAt] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [misfirePolicy, setMisfirePolicy] = useState<MisfirePolicy>("SKIP");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
  const canMutate = selectedWorkspace?.role === "OWNER" || selectedWorkspace?.role === "ADMIN";

  async function loadSchedules(nextWorkspaceId: string) {
    if (!nextWorkspaceId) return setSchedules([]);
    const body = await readScheduleResponse<{ schedules: Schedule[] }>(await fetch("/api/workflow-schedules?workspaceId=" + encodeURIComponent(nextWorkspaceId), { cache: "no-store" }));
    setSchedules(body.schedules);
  }

  async function loadWorkflows(nextWorkspaceId: string) {
    if (!nextWorkspaceId) return setWorkflows([]);
    const body = await readScheduleResponse<{ workflows: Workflow[] }>(await fetch("/api/workflows?workspaceId=" + encodeURIComponent(nextWorkspaceId), { cache: "no-store" }));
    setWorkflows(body.workflows);
    setWorkflowId((current) => body.workflows.some((workflow) => workflow.id === current) ? current : body.workflows[0]?.id ?? "");
  }

  useEffect(() => {
    void (async () => {
      const body = await readScheduleResponse<{ workspaces: Array<{ workspace: Omit<Workspace, "role">; role: Workspace["role"] }> }>(await fetch("/api/workspaces", { cache: "no-store" }));
      const nextWorkspaces = body.workspaces.map((entry) => ({ ...entry.workspace, role: entry.role }));
      setWorkspaces(nextWorkspaces);
      setWorkspaceId(nextWorkspaces[0]?.id ?? "");
    })().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load workspaces."));
  }, []);

  useEffect(() => {
    void Promise.all([loadWorkflows(workspaceId), loadSchedules(workspaceId)]).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load schedules."));
  }, [workspaceId]);

  function resetForm() {
    setEditingId(null);
    setType("CRON");
    setCronExpression("15 10 * * *");
    setIntervalSeconds("3600");
    setRunAt("");
    setTimezone("UTC");
    setMisfirePolicy("SKIP");
  }

  function edit(schedule: Schedule) {
    setEditingId(schedule.id);
    setType(schedule.type);
    setCronExpression(schedule.cronExpression ?? "15 10 * * *");
    setIntervalSeconds(String(schedule.intervalSeconds ?? 3600));
    setRunAt(schedule.runAt ? new Date(schedule.runAt).toISOString().slice(0, 16) : "");
    setTimezone(schedule.timezone);
    setMisfirePolicy(schedule.misfirePolicy);
  }

  function scheduleBody() {
    return {
      type,
      cronExpression: type === "CRON" ? cronExpression : null,
      intervalSeconds: type === "INTERVAL" ? Number(intervalSeconds) : null,
      runAt: type === "ONE_TIME" && runAt ? new Date(runAt).toISOString() : null,
      timezone,
      misfirePolicy,
      input: {},
    };
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspaceId || !workflowId) return setError("Select a workspace and workflow first.");
    setPending(true); setError(null); setMessage(null);
    try {
      if (editingId) {
        await readScheduleResponse(await fetch("/api/workflow-schedules/" + editingId, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(scheduleBody()) }));
        setMessage("Schedule updated.");
      } else {
        await readScheduleResponse(await fetch("/api/workflow-schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, workflowId, schedule: scheduleBody() }) }));
        setMessage("Schedule created.");
      }
      await loadSchedules(workspaceId);
      resetForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save schedule.");
    } finally {
      setPending(false);
    }
  }

  async function toggle(schedule: Schedule) {
    setPending(true); setError(null);
    try {
      const action = schedule.enabled ? "disable" : "enable";
      await readScheduleResponse(await fetch("/api/workflow-schedules/" + schedule.id + "/" + action, { method: "POST" }));
      await loadSchedules(workspaceId);
      setMessage(schedule.enabled ? "Schedule disabled." : "Schedule enabled.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update schedule.");
    } finally {
      setPending(false);
    }
  }

  async function remove(schedule: Schedule) {
    setPending(true); setError(null);
    try {
      await readScheduleResponse(await fetch("/api/workflow-schedules/" + schedule.id, { method: "DELETE" }));
      await loadSchedules(workspaceId);
      setMessage("Schedule deleted.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete schedule.");
    } finally {
      setPending(false);
    }
  }

  async function showOccurrences(schedule: Schedule) {
    try {
      const body = await readScheduleResponse<{ occurrences: Occurrence[] }>(await fetch("/api/workflow-schedules/" + schedule.id + "/occurrences", { cache: "no-store" }));
      setOccurrences((current) => ({ ...current, [schedule.id]: body.occurrences }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load schedule history.");
    }
  }

  return <section className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
    <div className="flex items-start justify-between gap-4">
      <div><p className="text-sm font-semibold">Workflow schedules</p><p className="mt-1 text-sm text-slate-500">Run existing durable workflows on a bounded CRON, interval, or one-time clock.</p></div>
      <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">Milestone 7</span>
    </div>
    <div className="mt-5 space-y-2"><Label htmlFor="schedule-workspace">Workspace</Label><select id="schedule-workspace" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm"><option value="">Select workspace</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></div>
    {canMutate && <form onSubmit={save} className="mt-5 space-y-3 rounded-2xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
      <div className="flex items-center justify-between"><p className="text-sm font-semibold">{editingId ? "Edit schedule" : "Create a schedule"}</p>{editingId && <Button type="button" variant="ghost" size="sm" onClick={resetForm}>Cancel</Button>}</div>
      <Label htmlFor="schedule-workflow">Workflow</Label><select id="schedule-workflow" value={workflowId} onChange={(event) => setWorkflowId(event.target.value)} disabled={Boolean(editingId)} className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm"><option value="">Select workflow</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}{workflow.enabled ? "" : " (disabled)"}</option>)}</select>
      <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="schedule-type">Type</Label><select id="schedule-type" value={type} onChange={(event) => setType(event.target.value as ScheduleType)} className="mt-2 h-10 w-full rounded-xl border bg-transparent px-3 text-sm"><option value="CRON">CRON</option><option value="INTERVAL">INTERVAL</option><option value="ONE_TIME">ONE_TIME</option></select></div><div><Label htmlFor="schedule-timezone">IANA timezone</Label><Input id="schedule-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="UTC" /></div></div>
      {type === "CRON" && <div><Label htmlFor="schedule-cron">Five-field CRON</Label><Input id="schedule-cron" value={cronExpression} onChange={(event) => setCronExpression(event.target.value)} placeholder="15 10 * * 1-5" /></div>}
      {type === "INTERVAL" && <div><Label htmlFor="schedule-interval">Interval seconds</Label><Input id="schedule-interval" type="number" min={60} value={intervalSeconds} onChange={(event) => setIntervalSeconds(event.target.value)} /></div>}
      {type === "ONE_TIME" && <div><Label htmlFor="schedule-run-at">Run at (local input converted to UTC)</Label><Input id="schedule-run-at" type="datetime-local" value={runAt} onChange={(event) => setRunAt(event.target.value)} /></div>}
      <div><Label htmlFor="schedule-misfire">Misfire policy</Label><select id="schedule-misfire" value={misfirePolicy} onChange={(event) => setMisfirePolicy(event.target.value as MisfirePolicy)} className="mt-2 h-10 w-full rounded-xl border bg-transparent px-3 text-sm"><option value="SKIP">SKIP missed occurrence</option><option value="FIRE_ONCE">FIRE_ONCE most recent eligible</option></select></div>
      <p className="text-xs text-slate-500">Misfires are bounded by the server grace window; the scheduler never backfills an unbounded history.</p>
      <Button type="submit" disabled={pending || !workflowId}>{pending ? "Saving..." : editingId ? "Update schedule" : "Create schedule"}</Button>
    </form>}
    <div className="mt-6 space-y-3">{schedules.map((schedule) => {
      const workflow = workflows.find((candidate) => candidate.id === schedule.workflowId);
      const history = occurrences[schedule.id];
      return <article key={schedule.id} className="rounded-2xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{workflow?.name ?? "Workflow"}</p><p className="mt-1 text-xs text-slate-500">{schedule.type} · {schedule.timezone} · next {displayDate(schedule.nextRunAt)}</p></div><span className={schedule.enabled ? "rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700" : "rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600"}>{schedule.enabled ? "Enabled" : "Disabled"}</span></div><p className="mt-2 text-xs text-slate-500">Last processed {displayDate(schedule.lastProcessedAt)} · last triggered {displayDate(schedule.lastTriggeredAt)}</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => void showOccurrences(schedule)}>History</Button>{canMutate && <><Button type="button" variant="outline" size="sm" onClick={() => edit(schedule)} disabled={pending}>Edit</Button><Button type="button" variant="outline" size="sm" onClick={() => void toggle(schedule)} disabled={pending}>{schedule.enabled ? "Disable" : "Enable"}</Button><Button type="button" variant="ghost" size="sm" onClick={() => void remove(schedule)} disabled={pending}>Delete</Button></>}</div>{history && <div className="mt-3 space-y-1 border-t pt-3">{history.length === 0 ? <p className="text-xs text-slate-500">No occurrences yet.</p> : history.map((occurrence) => <p key={occurrence.id} className="text-xs text-slate-500">{occurrence.status} · {displayDate(occurrence.scheduledFor)}{occurrence.reasonCode ? " · " + occurrence.reasonCode : ""}</p>)}</div>}</article>;
    })}{workspaceId && schedules.length === 0 && <p className="rounded-2xl border border-dashed p-4 text-sm text-slate-500">No schedules in this workspace yet.</p>}</div>
    {message && <p role="status" className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">{message}</p>}{error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
  </section>;
}
