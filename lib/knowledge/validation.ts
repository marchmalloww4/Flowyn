import { z } from "zod";
import { getKnowledgeConfig } from "@/lib/knowledge/config";

const metadataValueSchema = z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]);
export const knowledgeMetadataSchema = z.record(z.string().max(80), metadataValueSchema).default({});

export const knowledgeCreateSchema = z.object({
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  sourceType: z.string().trim().min(1).max(80).default("manual"),
  sourceName: z.string().trim().max(500).optional().default(""),
  content: z.string().trim().min(1).max(getKnowledgeConfig().maxDocumentChars),
  metadata: knowledgeMetadataSchema,
}).strict();

export const knowledgePatchSchema = knowledgeCreateSchema.omit({ workspaceId: true, brandId: true }).partial().strict();

export const knowledgeListQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  brandId: z.string().uuid(),
}).strict();

export const knowledgeRetrieveSchema = z.object({
  brandId: z.string().uuid(),
  query: z.string().trim().min(1).max(4000),
  topK: z.coerce.number().int().min(1).max(20).default(5),
}).strict();

export type KnowledgeCreateInput = z.infer<typeof knowledgeCreateSchema>;
export type KnowledgePatchInput = z.infer<typeof knowledgePatchSchema>;
export type KnowledgeRetrieveInput = z.infer<typeof knowledgeRetrieveSchema>;
