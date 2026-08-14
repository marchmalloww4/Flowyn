import { z } from "zod";
import { stepIdSchema } from "@/lib/workflows/primitives";
import type { WorkflowEditorLayout } from "@/lib/workflows/editor";

const coordinateSchema = z.number().finite().min(-1_000_000).max(1_000_000);

export const workflowEditorLayoutSchema = z.object({
  nodes: z.array(z.object({ id: stepIdSchema, x: coordinateSchema, y: coordinateSchema }).strict()).max(100).superRefine((nodes, ctx) => {
    if (new Set(nodes.map((node) => node.id)).size !== nodes.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Layout node IDs must be unique." });
  }),
  viewport: z.object({ x: coordinateSchema, y: coordinateSchema, zoom: z.number().finite().min(0.1).max(4) }).strict(),
}).strict() satisfies z.ZodType<WorkflowEditorLayout>;

export type { WorkflowEditorLayout };

export function parseWorkflowEditorLayout(input: unknown): WorkflowEditorLayout {
  return workflowEditorLayoutSchema.parse(input);
}
