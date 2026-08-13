import { and, count, eq, sql } from "drizzle-orm";
import { getDatabase, type Database, user, workspaceMembers } from "@/lib/database";
import { requireWorkspaceMember, requireWorkspaceRole } from "@/lib/authz/authorization";
import { recordAuditEvent } from "@/lib/audit/service";
import { AppError } from "@/lib/security/errors";
import { canManageMembership, type WorkspaceRole } from "@/lib/workspaces/roles";
import type { AddMemberInput } from "@/lib/memberships/validation";

function normalizedRole(role: string): WorkspaceRole {
  return role.toUpperCase() as WorkspaceRole;
}

export async function listMembers(actorId: string, workspaceId: string, db: Database = getDatabase()) {
  await requireWorkspaceMember(actorId, workspaceId, db);
  return db.select({ id: workspaceMembers.id, userId: user.id, name: user.name, email: user.email, image: user.image, role: workspaceMembers.role, createdAt: workspaceMembers.createdAt, updatedAt: workspaceMembers.updatedAt }).from(workspaceMembers).innerJoin(user, eq(user.id, workspaceMembers.userId)).where(eq(workspaceMembers.workspaceId, workspaceId));
}

export async function addMember(actorId: string, workspaceId: string, input: AddMemberInput, db: Database = getDatabase()) {
  const actor = await requireWorkspaceMember(actorId, workspaceId, db);
  const requestedRole = input.role as WorkspaceRole;
  if (!canManageMembership(actor.role, null, "add") || (requestedRole === "ADMIN" && actor.role !== "OWNER")) throw new AppError("WORKSPACE_FORBIDDEN", 403, "You do not have permission to add this member.");
  const [targetUser] = await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(sql`lower(${user.email}) = ${input.email.toLowerCase()}`).limit(1);
  if (!targetUser) throw new AppError("USER_NOT_FOUND", 404, "User not found.");
  const [existing] = await db.select({ id: workspaceMembers.id }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, targetUser.id))).limit(1);
  if (existing) throw new AppError("MEMBER_EXISTS", 409, "User is already a workspace member.");
  const [membership] = await db.insert(workspaceMembers).values({ workspaceId, userId: targetUser.id, role: requestedRole }).returning();
  if (!membership) throw new AppError("MEMBER_CREATE_FAILED", 500, "Workspace member could not be added.");
  await recordAuditEvent({ workspaceId, actorUserId: actorId, action: "membership.added", resourceType: "membership", resourceId: membership.id, metadata: { targetUserId: targetUser.id, role: requestedRole } }, db);
  return { ...membership, user: targetUser };
}

export async function changeMemberRole(actorId: string, workspaceId: string, targetUserId: string, role: WorkspaceRole, db: Database = getDatabase()) {
  await requireWorkspaceRole(actorId, workspaceId, ["OWNER"], db);
  const [target] = await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, targetUserId))).limit(1);
  if (!target) throw new AppError("MEMBER_NOT_FOUND", 404, "Workspace member not found.");
  const currentRole = normalizedRole(target.role);
  if (currentRole === "OWNER" && role !== "OWNER") {
    const [{ ownerCount }] = await db.select({ ownerCount: count() }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "OWNER")));
    if (Number(ownerCount) <= 1) throw new AppError("LAST_OWNER", 409, "The workspace must retain an owner.");
  }
  const [membership] = await db.update(workspaceMembers).set({ role, updatedAt: new Date() }).where(eq(workspaceMembers.id, target.id)).returning();
  await recordAuditEvent({ workspaceId, actorUserId: actorId, action: "membership.role_changed", resourceType: "membership", resourceId: target.id, metadata: { targetUserId, from: currentRole, to: role } }, db);
  return membership;
}

export async function removeMember(actorId: string, workspaceId: string, targetUserId: string, db: Database = getDatabase()) {
  const actor = await requireWorkspaceMember(actorId, workspaceId, db);
  const [target] = await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, targetUserId))).limit(1);
  if (!target) throw new AppError("MEMBER_NOT_FOUND", 404, "Workspace member not found.");
  const targetRole = normalizedRole(target.role);
  if (!canManageMembership(actor.role, targetRole, "remove")) throw new AppError("WORKSPACE_FORBIDDEN", 403, "You do not have permission to remove this member.");
  if (targetRole === "OWNER") throw new AppError("OWNER_PROTECTED", 409, "Owners must transfer ownership before removal.");
  await db.delete(workspaceMembers).where(eq(workspaceMembers.id, target.id));
  await recordAuditEvent({ workspaceId, actorUserId: actorId, action: "membership.removed", resourceType: "membership", resourceId: target.id, metadata: { targetUserId, role: targetRole } }, db);
}

export async function leaveWorkspace(userId: string, workspaceId: string, db: Database = getDatabase()) {
  const membership = await requireWorkspaceMember(userId, workspaceId, db);
  if (membership.role === "OWNER") {
    const [{ ownerCount }] = await db.select({ ownerCount: count() }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "OWNER")));
    if (Number(ownerCount) <= 1) throw new AppError("LAST_OWNER", 409, "The sole owner cannot leave the workspace.");
  }
  await db.delete(workspaceMembers).where(eq(workspaceMembers.id, membership.id));
  await recordAuditEvent({ workspaceId, actorUserId: userId, action: "membership.left", resourceType: "membership", resourceId: membership.id, metadata: { role: membership.role } }, db);
}
