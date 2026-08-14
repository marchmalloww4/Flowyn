import { describe, expect, it } from "vitest";
import {
  calculateDueSchedule,
  calculateNextRunAt,
  type ScheduleCalculationInput,
} from "@/lib/schedules/calculator";

const utc = (value: string) => new Date(value);

function schedule(overrides: Partial<ScheduleCalculationInput>): ScheduleCalculationInput {
  return {
    type: "INTERVAL",
    cronExpression: null,
    intervalSeconds: 60,
    runAt: null,
    timezone: "UTC",
    misfirePolicy: "SKIP",
    nextRunAt: utc("2026-08-14T10:00:00.000Z"),
    ...overrides,
  };
}

describe("schedule calculation", () => {
  it("calculates the next interval instant from the supplied instant", () => {
    expect(calculateNextRunAt(schedule({}), utc("2026-08-14T10:00:00.000Z"))).toEqual(
      utc("2026-08-14T10:01:00.000Z"),
    );
  });

  it("calculates a five-field cron schedule in its configured timezone", () => {
    expect(
      calculateNextRunAt(
        schedule({
          type: "CRON",
          intervalSeconds: null,
          cronExpression: "0 10 * * *",
          timezone: "America/New_York",
          nextRunAt: null,
        }),
        utc("2026-08-14T13:00:00.000Z"),
      ),
    ).toEqual(utc("2026-08-14T14:00:00.000Z"));
  });

  it("records a normally due interval as triggered and preserves cadence", () => {
    const result = calculateDueSchedule(
      schedule({}),
      utc("2026-08-14T10:00:30.000Z"),
      60,
    );

    expect(result).toMatchObject({
      action: "TRIGGER",
      scheduledFor: utc("2026-08-14T10:00:00.000Z"),
      nextRunAt: utc("2026-08-14T10:01:00.000Z"),
      terminal: false,
    });
  });

  it("skips an interval misfire outside the grace window", () => {
    const result = calculateDueSchedule(
      schedule({}),
      utc("2026-08-14T10:02:01.000Z"),
      60,
    );

    expect(result).toMatchObject({
      action: "SKIP",
      scheduledFor: utc("2026-08-14T10:00:00.000Z"),
      nextRunAt: utc("2026-08-14T10:03:00.000Z"),
      reasonCode: "SCHEDULE_MISFIRE_GRACE_EXCEEDED",
    });
  });

  it("fires the most recent eligible occurrence for FIRE_ONCE", () => {
    const result = calculateDueSchedule(
      schedule({ misfirePolicy: "FIRE_ONCE" }),
      utc("2026-08-14T10:01:30.000Z"),
      60,
    );

    expect(result).toMatchObject({
      action: "TRIGGER",
      scheduledFor: utc("2026-08-14T10:01:00.000Z"),
      nextRunAt: utc("2026-08-14T10:02:00.000Z"),
    });
  });

  it("consumes a one-time schedule exactly once", () => {
    const result = calculateDueSchedule(
      schedule({
        type: "ONE_TIME",
        intervalSeconds: null,
        runAt: utc("2026-08-14T10:00:00.000Z"),
      }),
      utc("2026-08-14T10:00:01.000Z"),
      60,
    );

    expect(result).toMatchObject({
      action: "TRIGGER",
      scheduledFor: utc("2026-08-14T10:00:00.000Z"),
      nextRunAt: null,
      terminal: true,
    });
  });

  it("skips an expired one-time schedule and disables it", () => {
    const result = calculateDueSchedule(
      schedule({
        type: "ONE_TIME",
        intervalSeconds: null,
        runAt: utc("2026-08-14T10:00:00.000Z"),
      }),
      utc("2026-08-14T10:02:01.000Z"),
      60,
    );

    expect(result).toMatchObject({
      action: "SKIP",
      scheduledFor: utc("2026-08-14T10:00:00.000Z"),
      nextRunAt: null,
      terminal: true,
      reasonCode: "SCHEDULE_MISFIRE_GRACE_EXCEEDED",
    });
  });

  it("makes cron DST behavior contractual for the installed parser", () => {
    const spring = calculateNextRunAt(
      schedule({
        type: "CRON",
        cronExpression: "30 2 * * *",
        intervalSeconds: null,
        timezone: "America/New_York",
        nextRunAt: null,
      }),
      utc("2026-03-08T00:00:00.000Z"),
    );
    const fall = calculateNextRunAt(
      schedule({
        type: "CRON",
        cronExpression: "30 2 * * *",
        intervalSeconds: null,
        timezone: "America/New_York",
        nextRunAt: null,
      }),
      utc("2026-11-01T00:00:00.000Z"),
    );

    expect(spring).toEqual(utc("2026-03-08T07:30:00.000Z"));
    expect(fall).toEqual(utc("2026-11-01T07:30:00.000Z"));
  });
});
