import { describe, expect, it } from "vitest";
import { validateScheduleInput } from "@/lib/schedules/validation";

describe("schedule validation", () => {
  const base = {
    timezone: "UTC",
    misfirePolicy: "SKIP" as const,
    input: { source: "test" },
  };

  it("accepts a five-field cron schedule and normalizes its input", () => {
    const schedule = validateScheduleInput({
      ...base,
      type: "CRON",
      cronExpression: "15 10 * * 1-5",
    });

    expect(schedule.type).toBe("CRON");
    expect(schedule.cronExpression).toBe("15 10 * * 1-5");
    expect(schedule.intervalSeconds).toBeNull();
    expect(schedule.runAt).toBeNull();
  });

  it("rejects six-field cron expressions", () => {
    expect(() =>
      validateScheduleInput({
        ...base,
        type: "CRON",
        cronExpression: "0 15 10 * * 1-5",
      }),
    ).toThrow();
  });

  it("rejects invalid timezones and malformed cron syntax", () => {
    expect(() =>
      validateScheduleInput({
        ...base,
        type: "CRON",
        cronExpression: "not a cron",
        timezone: "Mars/Olympus",
      }),
    ).toThrow();
  });

  it("enforces the configured interval bounds", () => {
    expect(() =>
      validateScheduleInput({
        ...base,
        type: "INTERVAL",
        intervalSeconds: 59,
      }),
    ).toThrow();

    const schedule = validateScheduleInput({
      ...base,
      type: "INTERVAL",
      intervalSeconds: 60,
    });

    expect(schedule.intervalSeconds).toBe(60);
  });

  it("requires an explicit offset for one-time schedules", () => {
    expect(() =>
      validateScheduleInput({
        ...base,
        type: "ONE_TIME",
        runAt: "2026-08-14T10:00:00",
      }),
    ).toThrow();

    const schedule = validateScheduleInput({
      ...base,
      type: "ONE_TIME",
      runAt: "2026-08-14T10:00:00+08:00",
    });

    expect(schedule.runAt?.toISOString()).toBe("2026-08-14T02:00:00.000Z");
  });

  it("rejects input that is not bounded JSON", () => {
    expect(() =>
      validateScheduleInput({
        ...base,
        type: "INTERVAL",
        intervalSeconds: 60,
        input: { unsupported: BigInt(1) },
      }),
    ).toThrow();
  });
});
