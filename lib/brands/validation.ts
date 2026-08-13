import { z } from "zod";

export const brandInputSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(5000).optional().default(""),
  industry: z.string().trim().max(160).optional().default(""),
  website: z.string().url().max(500).optional().or(z.literal("")).default(""),
  targetAudience: z.string().trim().max(2000).optional().default(""),
  positioning: z.string().trim().max(3000).optional().default(""),
  valueProposition: z.string().trim().max(3000).optional().default(""),
  tone: z.string().trim().max(1000).optional().default(""),
  personality: z.string().trim().max(1000).optional().default(""),
  preferredVocabulary: z.array(z.string().trim().min(1).max(100)).max(100).optional().default([]),
  forbiddenVocabulary: z.array(z.string().trim().min(1).max(100)).max(100).optional().default([]),
  writingRules: z.array(z.string().trim().min(1).max(500)).max(100).optional().default([]),
  ctaPreferences: z.string().trim().max(2000).optional().default(""),
  formattingPreferences: z.string().trim().max(2000).optional().default(""),
  productInformation: z.string().trim().max(5000).optional().default(""),
});

export const brandPatchSchema = brandInputSchema.omit({ workspaceId: true }).partial();
export type BrandInput = z.infer<typeof brandInputSchema>;
export type BrandPatch = z.infer<typeof brandPatchSchema>;