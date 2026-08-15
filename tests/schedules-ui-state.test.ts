import { describe, expect, it } from "vitest";
import { canManageSchedules, filterWorkspaceSchedules, scheduleStatusLabel, type ScheduleRecord } from "@/lib/client/schedules-state";

const schedules: ScheduleRecord[] = [{ id: "schedule-a", workspaceId: "workspace-a", enabled: true, type: "CRON" }];

describe("schedule presentation state", () => {
  it("keeps schedules scoped to the selected workspace", () => {
    expect(filterWorkspaceSchedules(schedules, "workspace-a")).toHaveLength(1);
    expect(filterWorkspaceSchedules(schedules, "workspace-b")).toEqual([]);
  });

  it("preserves management roles and safe status text", () => {
    expect(canManageSchedules("ADMIN")).toBe(true);
    expect(canManageSchedules("MEMBER")).toBe(false);
    expect(scheduleStatusLabel(true)).toBe("Enabled");
    expect(scheduleStatusLabel(false)).toBe("Disabled");
  });
});
