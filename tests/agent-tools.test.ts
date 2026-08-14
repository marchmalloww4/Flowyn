import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBrand } from "@/lib/brands/service";
import { retrieveKnowledge } from "@/lib/knowledge/retrieval";
import { searchBrandKnowledgeTool } from "@/lib/agents/tools/search-brand-knowledge";
import { getBrandProfileTool } from "@/lib/agents/tools/get-brand-profile";

vi.mock("@/lib/brands/service", () => ({ getBrand: vi.fn() }));
vi.mock("@/lib/knowledge/retrieval", () => ({ retrieveKnowledge: vi.fn() }));

const context = { workspaceId: "workspace-a", userId: "user-a", agentId: "agent-a", runId: "run-a", brandId: "brand-a", abortSignal: new AbortController().signal };

describe("built-in agent tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBrand).mockResolvedValue({ id: "brand-a", workspaceId: "workspace-a", name: "Flowyn", description: "Local automation", tone: "clear", preferredVocabulary: ["local"], forbiddenVocabulary: [], writingRules: [], targetAudience: null, industry: null, website: null, positioning: null, valueProposition: null, personality: null, ctaPreferences: null, formattingPreferences: null, productInformation: null } as never);
    vi.mocked(retrieveKnowledge).mockResolvedValue([{ documentId: "document-a", title: "Campaign facts", sourceType: "manual", sourceName: "Notes", stableKey: "key", content: "The campaign color is violet.", metadata: {}, similarity: 0.95 }]);
  });

  it("uses trusted context for brand knowledge and separates model output from persistence summary", async () => {
    const input = searchBrandKnowledgeTool.inputSchema.parse({ query: "campaign color", topK: 3 });
    const result = await searchBrandKnowledgeTool.execute(input, context);

    expect(getBrand).toHaveBeenCalledWith("user-a", "brand-a", expect.anything());
    expect(retrieveKnowledge).toHaveBeenCalledWith({ userId: "user-a", brandId: "brand-a", query: "campaign color", topK: 3 }, expect.anything());
    expect(result.modelObservation.results[0]?.content).toContain("violet");
    expect(JSON.stringify(result.safeSummary)).not.toContain("violet");
  });

  it("rejects model-supplied identity fields from the knowledge tool schema", () => {
    expect(searchBrandKnowledgeTool.inputSchema.safeParse({ query: "secret", workspaceId: "workspace-b" }).success).toBe(false);
  });

  it("returns a safe profile observation using the trusted brand", async () => {
    const result = await getBrandProfileTool.execute({}, context);

    expect(getBrand).toHaveBeenCalledWith("user-a", "brand-a", expect.anything());
    expect(result.modelObservation.name).toBe("Flowyn");
    expect(JSON.stringify(result.safeSummary)).not.toContain("Local automation");
  });
});
