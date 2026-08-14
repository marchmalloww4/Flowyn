import { z } from "zod";
import { getAgentExecutionPolicy } from "@/lib/agents/policy";

const toolNameSchema = z.string().trim().min(1).max(80);

export const agentCreateSchema = z.object({
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(""),
  systemInstructions: z.string().trim().max(8000).default(""),
  allowedTools: z.array(toolNameSchema).max(20).default([]),
  enabled: z.boolean().default(true),
  maxSteps: z.number().int().min(1).max(getAgentExecutionPolicy().hardMaxSteps).default(getAgentExecutionPolicy().maxSteps),
}).strict();

export const agentPatchSchema = agentCreateSchema.omit({ workspaceId: true }).partial().strict();

export const agentRunSchema = z.object({
  goal: z.string().trim().min(1).max(getAgentExecutionPolicy().maxGoalChars),
}).strict();

export const agentListQuerySchema = z.object({ workspaceId: z.string().uuid() }).strict();

export type AgentCreateInput = z.infer<typeof agentCreateSchema>;
export type AgentPatchInput = z.infer<typeof agentPatchSchema>;
export type AgentRunInput = z.infer<typeof agentRunSchema>;
