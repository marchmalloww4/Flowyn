import { z } from "zod";
import { scheduleInputSchema } from "@/lib/schedules/validation";

const uuidSchema = z.string().uuid();

export const workflowScheduleListQuerySchema = z.object({ workspaceId: uuidSchema }).strict();

export const workflowScheduleCreateSchema = z.object({
  workspaceId: uuidSchema,
  workflowId: uuidSchema,
  schedule: scheduleInputSchema,
}).strict();

export const workflowSchedulePatchSchema = z.object({
  type: scheduleInputSchema.shape.type.optional(),
  cronExpression: scheduleInputSchema.shape.cronExpression,
  intervalSeconds: scheduleInputSchema.shape.intervalSeconds,
  runAt: scheduleInputSchema.shape.runAt,
  timezone: scheduleInputSchema.shape.timezone.optional(),
  misfirePolicy: scheduleInputSchema.shape.misfirePolicy.optional(),
  input: scheduleInputSchema.shape.input.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one schedule field is required.");

export type WorkflowScheduleCreateInput = z.infer<typeof workflowScheduleCreateSchema>;
export type WorkflowSchedulePatchInput = z.infer<typeof workflowSchedulePatchSchema>;
