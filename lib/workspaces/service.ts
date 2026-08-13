import { and, desc, eq } from "drizzle-orm";
import { getDatabase, type Database, auditLogs, user, workspaceMembers, workspaces } from "@/lib/database";
import { AppError } from "@/lib/security/errors";
import { type WorkspaceInput } from "@/lib/workspaces/validation";

function slugForName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export async function requireWorkspaceMember(userId: string, workspaceId: string, db: Database = getDatabase()) {
  const [membership] = await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))).limit(1);
  if (!membership) throw new AppError("WORKSPACE_NOT_FOUND", 404, "Workspace not found.");
  return membership;
}

export async function listWorkspaces(userId: string, db: Database = getDatabase()) {
  return db.select({ workspace: workspaces, role: workspaceMembers.role }).from(workspaceMembers).innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId)).where(eq(workspaceMembers.userId, userId)).orderBy(desc(workspaces.createdAt));
}

export async function createWorkspace(userId: string, input: WorkspaceInput, db: Database = getDatabase()) {
  const slug = input.slug || slugForName(input.name);
  return db.transaction(async (tx) => {
    const [workspace] = await tx.insert(workspaces).values({ name: input.name, slug, createdBy: userId }).returning();
    if (!workspace) throw new AppError("WORKSPACE_CREATE_FAILED", 500, "Workspace could not be created.");
    await tx.insert(workspaceMembers).values({ workspaceId: workspace.id, userId, role: "owner" });
    await tx.insert(auditLogs).values({ workspaceId: workspace.id, actorUserId: userId, action: "workspace.created", resourceType: "workspace", resourceId: workspace.id });
    return workspace;
  });
}

export async function ensureUserExists(userId: string, db: Database = getDatabase()) {
  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
  if (!existing) throw new AppError("USER_NOT_FOUND", 401, "Authenticated user no longer exists.");
}