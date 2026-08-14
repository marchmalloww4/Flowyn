import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createAgent, getAgentRun } from "@/lib/agents/service";
import { runAgent } from "@/lib/agents/runner";
import { createKnowledgeDocument } from "@/lib/knowledge/service";
import { indexKnowledgeDocument } from "@/lib/knowledge/indexing";
import { brands, closeDatabase, getDatabase, user, workspaceMembers, workspaces } from "@/lib/database";

const integration = process.env.RUN_OLLAMA_INTEGRATION === "1" ? describe : describe.skip;
const suffix = randomUUID().slice(0, 8);
const account = { id: `flowyn-agent-ollama-${suffix}`, email: `flowyn-agent-ollama-${suffix}@example.test` };
let workspaceId = "";
let brandId = "";

integration("real Ollama agent integration", () => {
  beforeAll(async () => {
    const db = getDatabase();
    await db.insert(user).values({ id: account.id, name: "Agent Ollama Integration", email: account.email, emailVerified: true });
    const [workspace] = await db.insert(workspaces).values({ name: `Agent Ollama ${suffix}`, slug: `agent-ollama-${suffix}`, createdBy: account.id }).returning();
    workspaceId = workspace!.id;
    await db.insert(workspaceMembers).values({ workspaceId, userId: account.id, role: "OWNER" });
    const [brand] = await db.insert(brands).values({ workspaceId, createdBy: account.id, name: `Flowyn Violet Brand ${suffix}`, tone: "clear" }).returning();
    brandId = brand!.id;
  }, 120000);

  afterAll(async () => {
    const db = getDatabase();
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(user).where(eq(user.id, account.id));
    await closeDatabase();
  }, 60000);

  it("uses a registered brand tool and returns the violet fact", async () => {
    const document = await createKnowledgeDocument(account.id, { workspaceId, brandId, title: "Campaign color", sourceType: "manual", sourceName: "Integration fact", content: "Flowyn's preferred campaign color is violet.", metadata: {} });
    await indexKnowledgeDocument(account.id, document.id);
    const agent = await createAgent(account.id, { workspaceId, brandId, name: "Violet researcher", description: "", systemInstructions: "Use brand knowledge before answering factual questions.", allowedTools: ["search_brand_knowledge", "get_brand_profile"], enabled: true, maxSteps: 4 });

    const result = await runAgent({ userId: account.id, agentId: agent.id, goal: "What is Flowyn's preferred campaign color? Use the brand knowledge and answer briefly." });
    const history = await getAgentRun(account.id, result.runId);

    expect(result.status).toBe("COMPLETED");
    expect(result.finalResponse?.toLowerCase()).toContain("violet");
    expect(history.steps.some((step) => step.type === "TOOL_CALL" && step.toolName === "search_brand_knowledge")).toBe(true);
    expect(history.steps.every((step) => !Object.prototype.hasOwnProperty.call(step.safeOutputMetadata, "modelObservation"))).toBe(true);
  }, 360000);
});
