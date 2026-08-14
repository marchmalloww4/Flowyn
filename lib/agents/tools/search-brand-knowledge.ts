import { z } from "zod";
import { getBrand, getBrandForWorkspace } from "@/lib/brands/service";
import { getDatabase } from "@/lib/database";
import { retrieveKnowledge, retrieveKnowledgeForWorkspace, type RetrievedKnowledge } from "@/lib/knowledge/retrieval";
import { AppError } from "@/lib/security/errors";
import type { AgentTool, ToolExecutionContext, ToolExecutionResult } from "@/lib/agents/registry";

const searchInputSchema = z.object({
  query: z.string().trim().min(1).max(4000),
  topK: z.number().int().min(1).max(5).default(5),
}).strict();

interface SearchObservation {
  results: RetrievedKnowledge[];
}

function assertBrandContext(context: ToolExecutionContext) {
  if (!context.brandId) throw new AppError("AGENT_TOOL_CONTEXT_MISSING", 400, "This agent tool requires an authorized brand.");
  return context.brandId;
}

export const searchBrandKnowledgeTool: AgentTool<z.infer<typeof searchInputSchema>, SearchObservation> = {
  name: "search_brand_knowledge",
  description: "Search the authorized brand's indexed knowledge for relevant facts.",
  inputSchema: searchInputSchema,
  inputDescription: 'Required JSON: {"query":"campaign color","topK":5}. query is a non-empty search question; topK is optional and must be 1-5.',
  requiresBrand: true,
  inputJsonSchema: {
    type: "object",
    additionalProperties: false,
    properties: { query: { type: "string", minLength: 1 }, topK: { type: "integer", minimum: 1, maximum: 5 } },
    required: ["query"],
  },
  async execute(input, context): Promise<ToolExecutionResult<SearchObservation>> {
    const brandId = assertBrandContext(context);
    const db = getDatabase();
    const brand = context.principal?.kind === "workspace_automation"
      ? await getBrandForWorkspace(context.workspaceId, brandId, db)
      : context.userId
        ? await getBrand(context.userId, brandId, db)
        : null;
    if (!brand) throw new AppError("AGENT_TOOL_CONTEXT_MISSING", 500, "The agent execution principal is missing.");
    if (brand.workspaceId !== context.workspaceId) throw new AppError("RESOURCE_NOT_FOUND", 404, "Resource not found.");
    const startedAt = performance.now();
    const results = context.principal?.kind === "workspace_automation"
      ? await retrieveKnowledgeForWorkspace({ workspaceId: context.workspaceId, brandId, query: input.query, topK: input.topK }, db)
      : context.userId
        ? await retrieveKnowledge({ userId: context.userId, brandId, query: input.query, topK: input.topK }, db)
        : [];
    const modelObservation = { results };
    const characterCount = this.serializeObservation(modelObservation).length;
    return {
      modelObservation,
      safeSummary: { metadata: { resultCount: results.length }, durationMs: Math.max(0, Math.round(performance.now() - startedAt)), characterCount },
    };
  },
  serializeObservation(output) {
    return JSON.stringify(output);
  },
};
