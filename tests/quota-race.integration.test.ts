import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { getDatabase, user, workspaceUsageAdmissions, workspaceUsageBuckets, workspaces } from "@/lib/database";
import { admitWorkspaceUsage, dayBucketStart } from "@/lib/usage/admission";

const integration = process.env.RUN_DATABASE_RACE_INTEGRATION === "1" ? describe : describe.skip;
const ids = { user: `flowyn-m12-quota-${randomUUID()}`, workspace: "", slug: `flowyn-m12-quota-${randomUUID()}` };

integration("durable quota admission race", () => {
  afterAll(async () => {
    const db = getDatabase();
    if (ids.workspace) await db.delete(workspaces).where(eq(workspaces.id, ids.workspace));
    await db.delete(user).where(eq(user.id, ids.user));
  });

  it("admits no more than one concurrent unit against a one-unit bucket", async () => {
    const db = getDatabase();
    await db.insert(user).values({ id: ids.user, name: "M12 quota race", email: `${ids.user}@example.test`, emailVerified: true });
    const [workspace] = await db.insert(workspaces).values({ name: "M12 quota race", slug: ids.slug, createdBy: ids.user }).returning({ id: workspaces.id });
    ids.workspace = workspace!.id;
    const now = new Date();
    const results = await Promise.allSettled(["operation-a", "operation-b"].map((operationKey) => admitWorkspaceUsage({ workspaceId: ids.workspace, metric: "WORKFLOW_START_DAY", operationKey, sourceType: "TEST", bucketStart: dayBucketStart(now), limit: 1, now, db })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const admissions = await db.select().from(workspaceUsageAdmissions).where(eq(workspaceUsageAdmissions.workspaceId, ids.workspace));
    const [bucket] = await db.select().from(workspaceUsageBuckets).where(and(eq(workspaceUsageBuckets.workspaceId, ids.workspace), eq(workspaceUsageBuckets.metric, "WORKFLOW_START_DAY")));
    expect(admissions).toHaveLength(1);
    expect(bucket?.consumed).toBe(1);
  });
});
