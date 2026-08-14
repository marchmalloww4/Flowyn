import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/security/errors";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createWorkflowSchedule: vi.fn(),
  listWorkflowSchedules: vi.fn(),
  getWorkflowSchedule: vi.fn(),
  updateWorkflowSchedule: vi.fn(),
  deleteWorkflowSchedule: vi.fn(),
  setWorkflowScheduleEnabled: vi.fn(),
  listWorkflowScheduleOccurrences: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/schedules/service", () => ({
  createWorkflowSchedule: mocks.createWorkflowSchedule,
  listWorkflowSchedules: mocks.listWorkflowSchedules,
  getWorkflowSchedule: mocks.getWorkflowSchedule,
  updateWorkflowSchedule: mocks.updateWorkflowSchedule,
  deleteWorkflowSchedule: mocks.deleteWorkflowSchedule,
  setWorkflowScheduleEnabled: mocks.setWorkflowScheduleEnabled,
  listWorkflowScheduleOccurrences: mocks.listWorkflowScheduleOccurrences,
}));

import { GET as listGet, POST as createPost } from "@/app/api/workflow-schedules/route";
import { DELETE as deleteRoute, GET as getRoute, PATCH as patchRoute } from "@/app/api/workflow-schedules/[id]/route";
import { POST as enablePost } from "@/app/api/workflow-schedules/[id]/enable/route";
import { POST as disablePost } from "@/app/api/workflow-schedules/[id]/disable/route";
import { GET as occurrencesGet } from "@/app/api/workflow-schedules/[id]/occurrences/route";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const workflowId = "22222222-2222-4222-8222-222222222222";
const scheduleId = "33333333-3333-4333-8333-333333333333";
const schedule = { id: scheduleId, workspaceId, workflowId, type: "CRON", enabled: true, cronExpression: "15 10 * * *", intervalSeconds: null, runAt: null, timezone: "UTC", misfirePolicy: "SKIP", input: {}, nextRunAt: "2026-08-15T10:15:00.000Z" };
const context = { params: Promise.resolve({ id: scheduleId }) };

function request(url: string, method: string, body?: unknown): Request {
  return new Request(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), headers: { "Content-Type": "application/json" } });
}

describe("workflow schedule routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.createWorkflowSchedule.mockResolvedValue(schedule);
    mocks.listWorkflowSchedules.mockResolvedValue([schedule]);
    mocks.getWorkflowSchedule.mockResolvedValue(schedule);
    mocks.updateWorkflowSchedule.mockResolvedValue({ ...schedule, timezone: "Asia/Kuala_Lumpur" });
    mocks.deleteWorkflowSchedule.mockResolvedValue(undefined);
    mocks.setWorkflowScheduleEnabled.mockResolvedValue({ ...schedule, enabled: false });
    mocks.listWorkflowScheduleOccurrences.mockResolvedValue([]);
  });

  it("lists, creates, updates, toggles, and reads occurrence history", async () => {
    expect((await listGet(new Request(`http://localhost/api/workflow-schedules?workspaceId=${workspaceId}`))).status).toBe(200);
    expect(mocks.listWorkflowSchedules).toHaveBeenCalledWith("user-1", workspaceId);
    const created = await createPost(request("http://localhost/api/workflow-schedules", "POST", { workspaceId, workflowId, schedule: { type: "CRON", cronExpression: "15 10 * * *", timezone: "UTC", misfirePolicy: "SKIP", input: {} } }));
    expect(created.status).toBe(201);
    expect(mocks.createWorkflowSchedule).toHaveBeenCalledWith("user-1", expect.objectContaining({ workspaceId, workflowId }));
    expect((await patchRoute(request("http://localhost/api/workflow-schedules/id", "PATCH", { timezone: "Asia/Kuala_Lumpur" }), context)).status).toBe(200);
    expect(mocks.updateWorkflowSchedule).toHaveBeenCalledWith("user-1", scheduleId, { timezone: "Asia/Kuala_Lumpur" });
    expect((await enablePost(request("http://localhost/api/workflow-schedules/id", "POST"), context)).status).toBe(200);
    expect(mocks.setWorkflowScheduleEnabled).toHaveBeenCalledWith("user-1", scheduleId, true);
    expect((await disablePost(request("http://localhost/api/workflow-schedules/id", "POST"), context)).status).toBe(200);
    expect(mocks.setWorkflowScheduleEnabled).toHaveBeenCalledWith("user-1", scheduleId, false);
    expect((await occurrencesGet(new Request("http://localhost/api/workflow-schedules/id/occurrences"), context)).status).toBe(200);
  });

  it("rejects client identity fields and maps service errors safely", async () => {
    const invalid = await createPost(request("http://localhost/api/workflow-schedules", "POST", { workspaceId, workflowId, userId: "user-2", schedule: { type: "CRON", cronExpression: "15 10 * * *" } }));
    expect(invalid.status).toBe(400);
    expect(mocks.createWorkflowSchedule).not.toHaveBeenCalled();
    mocks.getWorkflowSchedule.mockRejectedValue(new AppError("WORKFLOW_SCHEDULE_NOT_FOUND", 404, "Workflow schedule not found."));
    expect((await getRoute(new Request("http://localhost/api/workflow-schedules/id"), context)).status).toBe(404);
    expect((await deleteRoute(request("http://localhost/api/workflow-schedules/id", "DELETE"), context)).status).toBe(204);
  });
});
