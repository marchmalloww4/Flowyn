import { z } from "zod";

const toolDecisionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  arguments: z.record(z.unknown()),
}).strict();

export const agentDecisionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tool"), tool: toolDecisionSchema }).strict(),
  z.object({ type: z.literal("final"), final: z.string().min(1) }).strict(),
]);

export type AgentDecision = z.infer<typeof agentDecisionSchema>;
