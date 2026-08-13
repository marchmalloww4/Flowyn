import { getDatabase, closeDatabase, user, workspaces, workspaceMembers, brands } from "@/lib/database";

async function seedDatabase(): Promise<void> {
  const db = getDatabase();
  const demoUserId = "flowyn-demo-user";
  const [demoUser] = await db.insert(user).values({ id: demoUserId, name: "Flowyn Demo", email: "demo@flowyn.local" }).onConflictDoNothing().returning();
  const createdBy = demoUser?.id ?? demoUserId;
  const [workspace] = await db.insert(workspaces).values({ name: "Demo Workspace", slug: "demo-workspace", createdBy }).onConflictDoNothing().returning();
  const workspaceId = workspace?.id;
  if (!workspaceId) {
    console.log("Demo workspace already exists; seed is idempotent.");
    return;
  }
  await db.insert(workspaceMembers).values({ workspaceId, userId: createdBy, role: "owner" });
  await db.insert(brands).values({ workspaceId, createdBy, name: "Acme AI", description: "A practical AI partner for growing teams.", tone: "clear, confident, and helpful", targetAudience: "Operations and marketing teams" });
  console.log("Seeded Demo Workspace and Acme AI.");
}

seedDatabase().catch((error: unknown) => {
  console.error("Database seed failed", error);
  process.exitCode = 1;
}).finally(() => closeDatabase());

export { seedDatabase };