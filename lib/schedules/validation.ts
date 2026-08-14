import { CronExpressionParser } from "cron-parser";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import type { JsonValue } from "@/lib/workflows/types";
import { misfirePolicies, scheduleTypes, type ValidatedScheduleInput } from "@/lib/schedules/types";

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);

const dateTimeSchema = z.union([
  z.string().datetime({ offset: true }),
  z.date().refine((value) => !Number.isNaN(value.getTime()), "Invalid date"),
]);

export const scheduleInputSchema = z.object({
  type: z.enum(scheduleTypes),
  cronExpression: z.string().trim().min(1).optional().nullable(),
  intervalSeconds: z.number().int().optional().nullable(),
  runAt: dateTimeSchema.optional().nullable(),
  timezone: z.string().trim().min(1).default("UTC"),
  misfirePolicy: z.enum(misfirePolicies).default("SKIP"),
  input: jsonValueSchema.default({}),
}).strict();

export interface ScheduleValidationOptions {
  minIntervalSeconds?: number;
  maxIntervalSeconds?: number;
  maxInputChars?: number;
}

function assertTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new Error(`Invalid IANA timezone: ${timezone}`);
  }
}

function assertCronExpression(expression: string, timezone: string): void {
  if (expression.split(/\s+/).length !== 5) {
    throw new Error("Cron expressions must contain exactly five fields");
  }

  try {
    CronExpressionParser.parse(expression, { tz: timezone });
  } catch {
    throw new Error("Invalid cron expression");
  }
}

function resolvePolicy(options?: ScheduleValidationOptions) {
  const env = getEnv();
  return {
    minIntervalSeconds: options?.minIntervalSeconds ?? env.SCHEDULE_MIN_INTERVAL_SECONDS,
    maxIntervalSeconds: options?.maxIntervalSeconds ?? env.SCHEDULE_MAX_INTERVAL_SECONDS,
    maxInputChars: options?.maxInputChars ?? env.WORKFLOW_MAX_INPUT_CHARS,
  };
}

export function validateScheduleInput(
  input: unknown,
  options?: ScheduleValidationOptions,
): ValidatedScheduleInput {
  const parsed = scheduleInputSchema.parse(input);
  const policy = resolvePolicy(options);

  assertTimezone(parsed.timezone);

  if (parsed.input !== undefined) {
    const serializedInput = JSON.stringify(parsed.input);
    if (serializedInput === undefined || serializedInput.length > policy.maxInputChars) {
      throw new Error("Schedule input exceeds the configured limit");
    }
  }

  const cronExpression = parsed.cronExpression?.trim() ?? null;
  const intervalSeconds = parsed.intervalSeconds ?? null;
  const runAt = parsed.runAt instanceof Date
    ? new Date(parsed.runAt.getTime())
    : parsed.runAt
      ? new Date(parsed.runAt)
      : null;

  if (parsed.type === "CRON") {
    if (!cronExpression) {
      throw new Error("CRON schedules require cronExpression");
    }
    if (intervalSeconds !== null || runAt !== null) {
      throw new Error("CRON schedules cannot include intervalSeconds or runAt");
    }
    assertCronExpression(cronExpression, parsed.timezone);
  }

  if (parsed.type === "INTERVAL") {
    if (intervalSeconds === null) {
      throw new Error("INTERVAL schedules require intervalSeconds");
    }
    if (
      intervalSeconds < policy.minIntervalSeconds ||
      intervalSeconds > policy.maxIntervalSeconds
    ) {
      throw new Error("Interval is outside the configured bounds");
    }
    if (cronExpression !== null || runAt !== null) {
      throw new Error("INTERVAL schedules cannot include cronExpression or runAt");
    }
  }

  if (parsed.type === "ONE_TIME") {
    if (runAt === null) {
      throw new Error("ONE_TIME schedules require runAt");
    }
    if (cronExpression !== null || intervalSeconds !== null) {
      throw new Error("ONE_TIME schedules cannot include cronExpression or intervalSeconds");
    }
  }

  return {
    type: parsed.type,
    cronExpression,
    intervalSeconds,
    runAt,
    timezone: parsed.timezone,
    misfirePolicy: parsed.misfirePolicy,
    input: parsed.input,
  };
}
