import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { getDatabase, user, workspaceConcurrencyStates, workspaces } from "@/lib/database";
import { acquireWorkspaceReservation, releaseWorkspaceReservation } from "@/lib/concurrency/service";

const integration = process.env.RUN_DATABASE_RACE_INTEGRATION === "1" ? describe : describe.skip;
const ids = { user: `flowyn-m12-concurrency-${randomUUID()}`, workspace: "", slug: `flowyn-m12-concurrency-${randomUUID()}` };

integration("PostgreSQL concurrency reservation race", () => {
  afterAll(async () => {
    const db = getDatabase();
    if (ids.workspace) await db.delete(workspaces).where(eq(workspaces.id, ids.workspace));
    await db.delete(user).where(eq(user.id, ids.user));
  });

  it("serializes concurrent reservations at the workspace limit", async () => {
    const db = getDatabase();
    await db.insert(user).values({ id: ids.user, name: "M12 concurrency race", email: `${ids.user}@example.test`, emailVerified: true });
    const [workspace] = await db.insert(workspaces).values({ name: "M12 concurrency race", slug: ids.slug, createdBy: ids.user }).returning({ id: workspaces.id });
    ids.workspace = workspace!.id;
    const results = await Promise.all(["source-a", "source-b"].map((sourceId) => acquireWorkspaceReservation({ workspaceId: ids.workspace, operationClass: "AGENT", sourceId, ownerId: sourceId, limit: 1, leaseMs: 60_000, db })));
    expect(results.filter((result) => result.acquired)).toHaveLength(1);
    expect(results.filter((result) => !result.acquired)).toHaveLength(1);
    const acquired = results.find((result) => result.acquired)?.reservation;
    expect(acquired).toBeDefined();
    await releaseWorkspaceReservation({ reservationId: acquired!.id, workspaceId: ids.workspace, ownerId: acquired!.ownerId }, db);
    const [state] = await db.select().from(workspaceConcurrencyStates).where(eq(workspaceConcurrencyStates.workspaceId, ids.workspace));
    expect(state?.activeCount).toBe(0);
  });
});
