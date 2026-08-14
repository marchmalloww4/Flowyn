import { CronExpressionParser } from "cron-parser";
import type {
  ScheduleDefinition,
  ScheduleType,
} from "@/lib/schedules/types";

export interface ScheduleCalculationInput extends ScheduleDefinition {
  nextRunAt: Date | null;
}

export type ScheduleCalculationAction = "WAIT" | "TRIGGER" | "SKIP";

export interface ScheduleCalculation {
  action: ScheduleCalculationAction;
  scheduledFor: Date | null;
  nextRunAt: Date | null;
  terminal: boolean;
  reasonCode?: "SCHEDULE_MISFIRE_GRACE_EXCEEDED";
}

function assertValidDate(value: Date, name: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new Error(`${name} must be a valid date`);
  }
}

function calculateCronNextRunAt(schedule: ScheduleCalculationInput, from: Date): Date {
  if (!schedule.cronExpression) {
    throw new Error("CRON schedule is missing cronExpression");
  }

  return CronExpressionParser.parse(schedule.cronExpression, {
    currentDate: from,
    tz: schedule.timezone,
  }).next().toDate();
}

function calculateCronPreviousRunAt(schedule: ScheduleCalculationInput, from: Date): Date {
  if (!schedule.cronExpression) {
    throw new Error("CRON schedule is missing cronExpression");
  }

  return CronExpressionParser.parse(schedule.cronExpression, {
    currentDate: from,
    tz: schedule.timezone,
  }).prev().toDate();
}

export function calculateNextRunAt(schedule: ScheduleCalculationInput, from: Date): Date | null {
  assertValidDate(from, "from");

  if (schedule.type === "CRON") {
    return calculateCronNextRunAt(schedule, from);
  }

  if (schedule.type === "INTERVAL") {
    if (!schedule.intervalSeconds || schedule.intervalSeconds <= 0) {
      throw new Error("INTERVAL schedule is missing a positive intervalSeconds");
    }
    return new Date(from.getTime() + schedule.intervalSeconds * 1000);
  }

  if (!schedule.runAt) {
    throw new Error("ONE_TIME schedule is missing runAt");
  }

  return schedule.runAt.getTime() > from.getTime() ? new Date(schedule.runAt) : null;
}

function calculateLatestRunAt(schedule: ScheduleCalculationInput, now: Date): Date | null {
  if (!schedule.nextRunAt || schedule.nextRunAt.getTime() > now.getTime()) {
    return null;
  }

  if (schedule.type === "INTERVAL") {
    if (!schedule.intervalSeconds || schedule.intervalSeconds <= 0) {
      throw new Error("INTERVAL schedule is missing a positive intervalSeconds");
    }
    const intervalMs = schedule.intervalSeconds * 1000;
    const elapsedIntervals = Math.floor((now.getTime() - schedule.nextRunAt.getTime()) / intervalMs);
    return new Date(schedule.nextRunAt.getTime() + elapsedIntervals * intervalMs);
  }

  if (schedule.type === "CRON") {
    return calculateCronPreviousRunAt(schedule, new Date(now.getTime() + 1));
  }

  return schedule.runAt ? new Date(schedule.runAt) : null;
}

function calculateFollowingRunAt(
  schedule: ScheduleCalculationInput,
  scheduledFor: Date,
  now: Date,
): Date | null {
  if (schedule.type === "ONE_TIME") {
    return null;
  }

  if (schedule.type === "CRON") {
    return calculateNextRunAt(schedule, now);
  }

  if (!schedule.intervalSeconds || schedule.intervalSeconds <= 0) {
    throw new Error("INTERVAL schedule is missing a positive intervalSeconds");
  }

  const intervalMs = schedule.intervalSeconds * 1000;
  const elapsedIntervals = Math.max(
    0,
    Math.floor((now.getTime() - scheduledFor.getTime()) / intervalMs) + 1,
  );
  return new Date(scheduledFor.getTime() + elapsedIntervals * intervalMs);
}

function terminalOneTimeResult(
  action: Exclude<ScheduleCalculationAction, "WAIT">,
  schedule: ScheduleCalculationInput,
  reasonCode?: ScheduleCalculation["reasonCode"],
): ScheduleCalculation {
  return {
    action,
    scheduledFor: schedule.runAt ? new Date(schedule.runAt) : null,
    nextRunAt: null,
    terminal: true,
    ...(reasonCode ? { reasonCode } : {}),
  };
}

export function calculateDueSchedule(
  schedule: ScheduleCalculationInput,
  now: Date,
  graceSeconds: number,
): ScheduleCalculation {
  assertValidDate(now, "now");
  if (!Number.isFinite(graceSeconds) || graceSeconds < 0) {
    throw new Error("graceSeconds must be a non-negative finite number");
  }

  if (!schedule.nextRunAt || schedule.nextRunAt.getTime() > now.getTime()) {
    return {
      action: "WAIT",
      scheduledFor: null,
      nextRunAt: schedule.nextRunAt ? new Date(schedule.nextRunAt) : null,
      terminal: schedule.type === "ONE_TIME" && schedule.nextRunAt === null,
    };
  }

  const dueAgeMs = now.getTime() - schedule.nextRunAt.getTime();
  const graceMs = graceSeconds * 1000;

  if (schedule.type === "ONE_TIME") {
    if (dueAgeMs <= graceMs) {
      return terminalOneTimeResult("TRIGGER", schedule);
    }
    return terminalOneTimeResult("SKIP", schedule, "SCHEDULE_MISFIRE_GRACE_EXCEEDED");
  }

  if (dueAgeMs <= graceMs) {
    const scheduledFor = new Date(schedule.nextRunAt);
    return {
      action: "TRIGGER",
      scheduledFor,
      nextRunAt: calculateFollowingRunAt(schedule, scheduledFor, now),
      terminal: false,
    };
  }

  if (schedule.misfirePolicy === "FIRE_ONCE") {
    const latestRunAt = calculateLatestRunAt(schedule, now);
    if (latestRunAt && now.getTime() - latestRunAt.getTime() <= graceMs) {
      return {
        action: "TRIGGER",
        scheduledFor: latestRunAt,
        nextRunAt: calculateFollowingRunAt(schedule, latestRunAt, now),
        terminal: false,
      };
    }
  }

  const scheduledFor = new Date(schedule.nextRunAt);
  return {
    action: "SKIP",
    scheduledFor,
    nextRunAt: calculateFollowingRunAt(schedule, scheduledFor, now),
    terminal: false,
    reasonCode: "SCHEDULE_MISFIRE_GRACE_EXCEEDED",
  };
}

export function isRecurringSchedule(type: ScheduleType): boolean {
  return type === "CRON" || type === "INTERVAL";
}
