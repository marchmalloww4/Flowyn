import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { aiGenerateExecutor } from "@/lib/workflows/executors/ai-generate";
import { closeDatabase, getDatabase, user, workspaceMembers, workspaces } from "@/lib/database";
import { getAIProvider } from "@/lib/ai/service";

const integrationEnabled = process.env.RUN_WORKFLOW_OLLAMA_INTEGRATION === "1";
const describeIntegration = integrationEnabled ? describe : describe.skip;

describeIntegration("workflow Ollama integration", () => {
  const db = getDatabase();
  const userId = `workflow-ollama-${randomUUID()}`;
  const workspaceId = randomUUID();

  beforeAll(async () => {
    await db.insert(user).values({ id: userId, name: "Workflow Ollama Integration", email: `${userId}@example.test`, emailVerified: true });
    await db.insert(workspaces).values({ id: workspaceId, name: "Workflow Ollama Integration", slug: userId, createdBy: userId });
    await db.insert(workspaceMembers).values({ workspaceId, userId, role: "OWNER" });
  });

  afterAll(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(user).where(eq(user.id, userId));
    await closeDatabase();
  });

  it("executes an AI_GENERATE step through the configured LLMProvider", async () => {
    const result = await aiGenerateExecutor.execute({ runId: randomUUID(), workspaceId, actorUserId: userId, workflowId: randomUUID(), workflowVersion: 1, triggerInput: {}, stepOutputs: {}, abortSignal: new AbortController().signal, db, provider: getAIProvider() }, { prompt: { kind: "literal", value: "Reply with one short word: violet" }, maxTokens: 8 });
    expect(typeof result.output).toBe("string");
    expect(String(result.output).length).toBeGreaterThan(0);
  }, 120_000);
});
