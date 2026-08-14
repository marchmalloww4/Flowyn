import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { LLMProvider } from "@/lib/ai/types";
import { createAgent, deleteAgent, getAgent, getAgentRun } from "@/lib/agents/service";
import { runAgent } from "@/lib/agents/runner";
import { agentRunSteps, agentRuns, agents, brands, closeDatabase, getDatabase, user, workspaceMembers, workspaces } from "@/lib/database";

const integration = process.env.RUN_AGENT_INTEGRATION === "1" ? describe : describe.skip;
const suffix = randomUUID().slice(0, 8);
const owner = { id: `flowyn-agent-owner-${suffix}`, email: `flowyn-agent-owner-${suffix}@example.test` };
const outsider = { id: `flowyn-agent-outsider-${suffix}`, email: `flowyn-agent-outsider-${suffix}@example.test` };
let workspaceId = "";
let brandId = "";
let agentId = "";
let runId = "";

const finalProvider: LLMProvider = {
  generate: async () => ({ text: "", model: "test", done: true, durationMs: 1 }),
  generateStructured: async <T>() => ({ value: { type: "final", final: "The verified result is violet." } as T, text: "", model: "test", done: true, durationMs: 1 }),
  stream: async function* () { yield { text: "", model: "test", done: true }; },
  health: async () => ({ ready: true, model: "test" }),
};

integration("agent persistence integration", () => {
  beforeAll(async () => {
    const db = getDatabase();
    await db.insert(user).values([
      { id: owner.id, name: "Agent Integration Owner", email: owner.email, emailVerified: true },
      { id: outsider.id, name: "Agent Integration Outsider", email: outsider.email, emailVerified: true },
    ]);
    const [workspace] = await db.insert(workspaces).values({ name: `Agent Integration ${suffix}`, slug: `agent-integration-${suffix}`, createdBy: owner.id }).returning();
    workspaceId = workspace!.id;
    await db.insert(workspaceMembers).values({ workspaceId, userId: owner.id, role: "OWNER" });
    const [brand] = await db.insert(brands).values({ workspaceId, createdBy: owner.id, name: `Agent Brand ${suffix}` }).returning();
    brandId = brand!.id;
  });

  afterAll(async () => {
    const db = getDatabase();
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(user).where(eq(user.id, owner.id));
    await db.delete(user).where(eq(user.id, outsider.id));
    await closeDatabase();
  });

  it("persists a bounded run, preserves safe steps, and soft-deletes its agent", async () => {
    const agent = await createAgent(owner.id, { workspaceId, brandId, name: "Integration agent", description: "", systemInstructions: "", allowedTools: [], enabled: true, maxSteps: 2 });
    agentId = agent.id;
    const result = await runAgent({ userId: owner.id, agentId, goal: "Return the verified result", provider: finalProvider });
    runId = result.runId;

    expect(result.status).toBe("COMPLETED");
    expect(result.finalResponse).toContain("violet");
    const db = getDatabase();
    const [persistedRun] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId));
    const persistedSteps = await db.select().from(agentRunSteps).where(eq(agentRunSteps.runId, runId));
    expect(persistedRun?.status).toBe("COMPLETED");
    expect(persistedSteps.map((step) => step.type)).toEqual(["MODEL_DECISION", "FINAL_RESPONSE"]);
    expect(persistedSteps.every((step) => !Object.prototype.hasOwnProperty.call(step.safeOutputMetadata, "modelObservation"))).toBe(true);

    await deleteAgent(owner.id, agentId);
    const [deleted] = await db.select().from(agents).where(eq(agents.id, agentId));
    expect(deleted?.enabled).toBe(false);
    expect(deleted?.deletedAt).not.toBeNull();
    await expect(getAgent(owner.id, agentId)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    const history = await getAgentRun(owner.id, runId);
    expect(history.run.status).toBe("COMPLETED");
    expect(history.steps.length).toBe(2);
  }, 120000);

  it("keeps the run workspace boundary enforced", async () => {
    await expect(getAgentRun(outsider.id, runId)).rejects.toMatchObject({ status: 404 });
  });
});
