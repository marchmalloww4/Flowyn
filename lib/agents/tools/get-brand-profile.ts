import { z } from "zod";
import { getBrand, getBrandForWorkspace } from "@/lib/brands/service";
import { getDatabase } from "@/lib/database";
import { AppError } from "@/lib/security/errors";
import type { AgentTool, ToolExecutionResult } from "@/lib/agents/registry";

const profileInputSchema = z.object({}).strict();

interface BrandProfileObservation {
  name: string;
  description: string | null;
  industry: string | null;
  targetAudience: string | null;
  positioning: string | null;
  valueProposition: string | null;
  tone: string | null;
  personality: string | null;
  preferredVocabulary: string[];
  forbiddenVocabulary: string[];
  writingRules: string[];
  ctaPreferences: string | null;
  formattingPreferences: string | null;
  productInformation: string | null;
}

export const getBrandProfileTool: AgentTool<Record<string, never>, BrandProfileObservation> = {
  name: "get_brand_profile",
  description: "Read the authorized brand profile and writing preferences.",
  inputSchema: profileInputSchema,
  inputDescription: "{}",
  requiresBrand: true,
  inputJsonSchema: { type: "object", additionalProperties: false, properties: {} },
  async execute(_input, context): Promise<ToolExecutionResult<BrandProfileObservation>> {
    if (!context.brandId) throw new AppError("AGENT_TOOL_CONTEXT_MISSING", 400, "This agent tool requires an authorized brand.");
    const brand = context.principal?.kind === "workspace_automation"
      ? await getBrandForWorkspace(context.workspaceId, context.brandId, getDatabase())
      : context.userId
        ? await getBrand(context.userId, context.brandId, getDatabase())
        : null;
    if (!brand) throw new AppError("AGENT_TOOL_CONTEXT_MISSING", 500, "The agent execution principal is missing.");
    if (brand.workspaceId !== context.workspaceId) throw new AppError("RESOURCE_NOT_FOUND", 404, "Resource not found.");
    const modelObservation: BrandProfileObservation = {
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
    };
    return {
      modelObservation,
      safeSummary: { metadata: { fieldCount: Object.keys(modelObservation).length }, durationMs: 0, characterCount: JSON.stringify(modelObservation).length },
    };
  },
  serializeObservation(output) {
    return JSON.stringify(output);
  },
};
