import { and, desc, eq } from "drizzle-orm";
import { brands, getDatabase, type Database } from "@/lib/database";
import { AppError } from "@/lib/security/errors";
import { requireWorkspaceAction, requireWorkspaceMember } from "@/lib/authz/authorization";
import { recordAuditEvent } from "@/lib/audit/service";
import { type BrandInput, type BrandPatch } from "@/lib/brands/validation";

export async function listBrands(userId: string, workspaceId: string, db: Database = getDatabase()) {
  await requireWorkspaceMember(userId, workspaceId, db);
  return db.select().from(brands).where(eq(brands.workspaceId, workspaceId)).orderBy(desc(brands.createdAt));
}

export async function createBrand(userId: string, input: BrandInput, db: Database = getDatabase()) {
  await requireWorkspaceAction(userId, input.workspaceId, "brand.write", db);
  const [brand] = await db.insert(brands).values({ ...input, createdBy: userId }).returning();
  if (!brand) throw new AppError("BRAND_CREATE_FAILED", 500, "Brand could not be created.");
  await recordAuditEvent({ workspaceId: brand.workspaceId, actorUserId: userId, action: "brand.created", resourceType: "brand", resourceId: brand.id, metadata: { name: brand.name } }, db);
  return brand;
}

export async function getBrand(userId: string, brandId: string, db: Database = getDatabase()) {
  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw new AppError("BRAND_NOT_FOUND", 404, "Brand not found.");
  await requireWorkspaceMember(userId, brand.workspaceId, db);
  return brand;
}

export async function updateBrand(userId: string, brandId: string, input: BrandPatch, db: Database = getDatabase()) {
  const existing = await getBrand(userId, brandId, db);
  await requireWorkspaceAction(userId, existing.workspaceId, "brand.write", db);
  const [brand] = await db.update(brands).set({ ...input, updatedAt: new Date() }).where(and(eq(brands.id, existing.id), eq(brands.workspaceId, existing.workspaceId))).returning();
  if (!brand) throw new AppError("BRAND_UPDATE_FAILED", 500, "Brand could not be updated.");
  await recordAuditEvent({ workspaceId: brand.workspaceId, actorUserId: userId, action: "brand.updated", resourceType: "brand", resourceId: brand.id, metadata: { fields: Object.keys(input) } }, db);
  return brand;
}

export async function deleteBrand(userId: string, brandId: string, db: Database = getDatabase()): Promise<void> {
  const existing = await getBrand(userId, brandId, db);
  await requireWorkspaceAction(userId, existing.workspaceId, "brand.delete", db);
  await db.transaction(async (tx) => {
    await tx.delete(brands).where(and(eq(brands.id, existing.id), eq(brands.workspaceId, existing.workspaceId)));
    await recordAuditEvent({ workspaceId: existing.workspaceId, actorUserId: userId, action: "brand.deleted", resourceType: "brand", resourceId: existing.id, metadata: { name: existing.name } }, tx);
  });
}
