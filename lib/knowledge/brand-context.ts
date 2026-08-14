import { asc, eq } from "drizzle-orm";
import { getBrand, getBrandForWorkspace } from "@/lib/brands/service";
import { brandExamples, brandRules, brandVoiceProfiles, getDatabase, type Database } from "@/lib/database";
import type { BrandPromptContext } from "@/lib/ai/prompt";
import { getKnowledgeConfig } from "@/lib/knowledge/config";
import { retrieveKnowledge, retrieveKnowledgeForWorkspace, type RetrievedKnowledge } from "@/lib/knowledge/retrieval";
import type { ExecutionPrincipal } from "@/lib/security/principal";
import { AppError } from "@/lib/security/errors";

export const MAX_BRAND_RULES = 40;
export const MAX_BRAND_EXAMPLES = 10;

export interface BrandContext {
  brand: BrandPromptContext;
  voiceProfile: Record<string, unknown> | null;
  rules: Array<{ kind: string; value: string; explanation: string | null }>;
  examples: Array<{ content: string; source: string | null; explanation: string | null }>;
  knowledge: RetrievedKnowledge[];
}

function boundKnowledge(retrieved: RetrievedKnowledge[], maxContextChars: number): RetrievedKnowledge[] {
  let contextChars = 0;
  return retrieved.filter((item) => {
    const nextChars = item.content.length + item.title.length + (item.sourceName?.length ?? 0);
    if (contextChars + nextChars > maxContextChars) return false;
    contextChars += nextChars;
    return true;
  });
}

export async function getBrandContext(input: { userId: string; brandId: string; query?: string; includeKnowledge: boolean }, db: Database = getDatabase()): Promise<BrandContext> {
  const brand = await getBrand(input.userId, input.brandId, db);
  const config = getKnowledgeConfig();
  const [voiceProfile] = await db.select({ structuredProfile: brandVoiceProfiles.structuredProfile }).from(brandVoiceProfiles).where(eq(brandVoiceProfiles.brandId, brand.id)).limit(1);
  const rules = await db.select({ kind: brandRules.kind, value: brandRules.value, explanation: brandRules.explanation }).from(brandRules).where(eq(brandRules.brandId, brand.id)).orderBy(asc(brandRules.createdAt), asc(brandRules.id)).limit(MAX_BRAND_RULES);
  const examples = await db.select({ content: brandExamples.content, source: brandExamples.source, explanation: brandExamples.explanation }).from(brandExamples).where(eq(brandExamples.brandId, brand.id)).orderBy(asc(brandExamples.createdAt), asc(brandExamples.id)).limit(MAX_BRAND_EXAMPLES);
  const retrieved = input.includeKnowledge
    ? await retrieveKnowledge({ userId: input.userId, brandId: input.brandId, query: input.query?.trim() || brand.name, topK: config.topK }, db)
    : [];
  const knowledge = boundKnowledge(retrieved, config.maxContextChars);
  return {
    brand: {
      name: brand.name,
      description: brand.description,
      industry: brand.industry,
      targetAudience: brand.targetAudience,
      positioning: brand.positioning,
      valueProposition: brand.valueProposition,
      tone: brand.tone,
      personality: brand.personality,
      preferredVocabulary: brand.preferredVocabulary,
      forbiddenVocabulary: brand.forbiddenVocabulary,
      writingRules: brand.writingRules,
      ctaPreferences: brand.ctaPreferences,
      formattingPreferences: brand.formattingPreferences,
      productInformation: brand.productInformation,
      voiceProfile: voiceProfile?.structuredProfile ?? null,
      rules,
      examples,
      retrievedKnowledge: knowledge,
    },
    voiceProfile: voiceProfile?.structuredProfile ?? null,
    rules,
    examples,
    knowledge,
  };
}

export async function getBrandContextForPrincipal(input: { principal: ExecutionPrincipal; workspaceId: string; brandId: string; query?: string; includeKnowledge: boolean }, db: Database = getDatabase()): Promise<BrandContext> {
  const brand = input.principal.kind === "workspace_automation"
    ? await getBrandForWorkspace(input.workspaceId, input.brandId, db)
    : await getBrand(input.principal.userId, input.brandId, db);
  if (brand.workspaceId !== input.workspaceId) throw new AppError("RESOURCE_NOT_FOUND", 404, "Resource not found.");
  const config = getKnowledgeConfig();
  const [voiceProfile] = await db.select({ structuredProfile: brandVoiceProfiles.structuredProfile }).from(brandVoiceProfiles).where(eq(brandVoiceProfiles.brandId, brand.id)).limit(1);
  const rules = await db.select({ kind: brandRules.kind, value: brandRules.value, explanation: brandRules.explanation }).from(brandRules).where(eq(brandRules.brandId, brand.id)).orderBy(asc(brandRules.createdAt), asc(brandRules.id)).limit(MAX_BRAND_RULES);
  const examples = await db.select({ content: brandExamples.content, source: brandExamples.source, explanation: brandExamples.explanation }).from(brandExamples).where(eq(brandExamples.brandId, brand.id)).orderBy(asc(brandExamples.createdAt), asc(brandExamples.id)).limit(MAX_BRAND_EXAMPLES);
  const retrieved = input.includeKnowledge
    ? input.principal.kind === "workspace_automation"
      ? await retrieveKnowledgeForWorkspace({ workspaceId: input.workspaceId, brandId: input.brandId, query: input.query?.trim() || brand.name, topK: config.topK }, db)
      : await retrieveKnowledge({ userId: input.principal.userId, brandId: input.brandId, query: input.query?.trim() || brand.name, topK: config.topK }, db)
    : [];
  const knowledge = boundKnowledge(retrieved, config.maxContextChars);
  return {
    brand: {
      name: brand.name,
      description: brand.description,
      industry: brand.industry,
      targetAudience: brand.targetAudience,
      positioning: brand.positioning,
      valueProposition: brand.valueProposition,
      tone: brand.tone,
      personality: brand.personality,
      preferredVocabulary: brand.preferredVocabulary,
      forbiddenVocabulary: brand.forbiddenVocabulary,
      writingRules: brand.writingRules,
      ctaPreferences: brand.ctaPreferences,
      formattingPreferences: brand.formattingPreferences,
      productInformation: brand.productInformation,
      voiceProfile: voiceProfile?.structuredProfile ?? null,
      rules,
      examples,
      retrievedKnowledge: knowledge,
    },
    voiceProfile: voiceProfile?.structuredProfile ?? null,
    rules,
    examples,
    knowledge,
  };
}
