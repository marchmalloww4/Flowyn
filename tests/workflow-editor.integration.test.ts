import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { closeDatabase, getDatabase, user, workspaceMembers, workspaces } from "@/lib/database";
import { createWorkflow, getWorkflowEditorProjection, updateWorkflow } from "@/lib/workflows/service";

const integrationEnabled = process.env.RUN_WORKFLOW_EDITOR_INTEGRATION === "1";
const describeIntegration = integrationEnabled ? describe : describe.skip;

const definition = (value: string) => ({
  schemaVersion: 1 as const,
  entryStepId: "start",
  steps: [{ id: "start", type: "SET_VALUE" as const, name: "Start", config: { value: { kind: "literal" as const, value } } }],
});

describeIntegration("workflow editor PostgreSQL integration", () => {
  const db = getDatabase();
  const userId = `workflow-editor-${randomUUID()}`;
  const workspaceId = randomUUID();

  beforeAll(async () => {
    await db.insert(user).values({ id: userId, name: "Workflow Editor Integration", email: `${userId}@example.test`, emailVerified: true });
    await db.insert(workspaces).values({ id: workspaceId, name: "Workflow Editor Integration", slug: userId, createdBy: userId });
    await db.insert(workspaceMembers).values({ workspaceId, userId, role: "OWNER" });
  });

  afterAll(async () => {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await db.delete(user).where(eq(user.id, userId));
    await closeDatabase();
  });

  it("persists isolated layout metadata and enforces first-writer-wins version saves", async () => {
    const workflow = await createWorkflow(userId, { workspaceId, name: "Editor integration", description: "", definition: definition("one"), enabled: false }, db);
    const layout = { nodes: [{ id: "start", x: 240, y: 120 }], viewport: { x: 10, y: 20, zoom: 1.1 } };
    await updateWorkflow(userId, workflow.id, { expectedVersionId: workflow.currentVersionId!, layout }, db);
    const projection = await getWorkflowEditorProjection(userId, workflow.id, db);
    expect(projection.layout).toEqual(layout);

    const expectedVersionId = projection.currentVersionId;
    const results = await Promise.allSettled([
      updateWorkflow(userId, workflow.id, { definition: definition("two"), expectedVersionId }, db),
      updateWorkflow(userId, workflow.id, { definition: definition("three"), expectedVersionId }, db),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected?.reason).toMatchObject({ code: "WORKFLOW_VERSION_CONFLICT", status: 409 });
  });
});
