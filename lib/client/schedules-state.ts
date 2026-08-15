export type ScheduleRecord = { id: string; workspaceId: string; enabled: boolean; type: string };

export function filterWorkspaceSchedules(schedules: ScheduleRecord[], workspaceId: string): ScheduleRecord[] {
  return schedules.filter((schedule) => schedule.workspaceId === workspaceId);
}

export function canManageSchedules(role: string | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function scheduleStatusLabel(enabled: boolean): string {
  return enabled ? "Enabled" : "Disabled";
}
