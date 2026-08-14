import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  schema,
  workflowScheduleOccurrences,
  workflowSchedules,
} from "@/lib/database/schema";

describe("Milestone 7 schedule schema", () => {
  it("exports schedules and durable occurrences", () => {
    expect(schema.workflowSchedules).toBe(workflowSchedules);
    expect(schema.workflowScheduleOccurrences).toBe(workflowScheduleOccurrences);
    expect(workflowSchedules.workspaceId).toBeDefined();
    expect(workflowSchedules.workflowId).toBeDefined();
    expect(workflowSchedules.nextRunAt).toBeDefined();
    expect(workflowScheduleOccurrences.scheduleId).toBeDefined();
    expect(workflowScheduleOccurrences.scheduledFor).toBeDefined();
    expect(workflowScheduleOccurrences.workflowRunId).toBeDefined();
  });

  it("declares workspace, due-schedule, and occurrence uniqueness indexes", () => {
    const scheduleConfig = getTableConfig(workflowSchedules);
    const occurrenceConfig = getTableConfig(workflowScheduleOccurrences);

    expect(scheduleConfig.checks.length).toBeGreaterThan(0);
    expect(scheduleConfig.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "workflow_schedules_due_idx",
        "workflow_schedules_workspace_idx",
      ]),
    );
    expect(occurrenceConfig.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        "workflow_schedule_occurrences_schedule_scheduled_idx",
        "workflow_schedule_occurrences_workspace_idx",
        "workflow_schedule_occurrences_run_idx",
      ]),
    );
  });
});
