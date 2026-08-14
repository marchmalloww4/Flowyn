import type { JsonValue } from "@/lib/workflows/types";

export const scheduleTypes = ["CRON", "INTERVAL", "ONE_TIME"] as const;
export type ScheduleType = (typeof scheduleTypes)[number];

export const misfirePolicies = ["SKIP", "FIRE_ONCE"] as const;
export type MisfirePolicy = (typeof misfirePolicies)[number];

export const scheduleStatuses = ["TRIGGERED", "SKIPPED", "FAILED"] as const;
export type ScheduleStatus = (typeof scheduleStatuses)[number];

export interface ScheduleDefinition {
  type: ScheduleType;
  cronExpression: string | null;
  intervalSeconds: number | null;
  runAt: Date | null;
  timezone: string;
  misfirePolicy: MisfirePolicy;
}

export interface ValidatedScheduleInput extends ScheduleDefinition {
  input: JsonValue;
}
