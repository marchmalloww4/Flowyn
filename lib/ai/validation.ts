import { z } from "zod";
import { getAIConfig } from "@/lib/ai/config";

export const aiGenerationRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid().optional(),
  prompt: z.string().trim().min(1).max(getAIConfig().maxPromptChars),
  system: z.string().trim().max(4000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(getAIConfig().maxOutputTokens).optional(),
  stream: z.boolean().default(false),
  useBrandContext: z.boolean().default(false),
}).strict();

export type AIGenerationRequestInput = z.infer<typeof aiGenerationRequestSchema>;
