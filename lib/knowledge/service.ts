import { and, desc, eq } from "drizzle-orm";
import { getBrand } from "@/lib/brands/service";
import { requireWorkspaceAction } from "@/lib/authz/authorization";
import { recordAuditEvent } from "@/lib/audit/service";
import { getDatabase, knowledgeDocuments, type Database } from "@/lib/database";
import { sanitizeMetadata } from "@/lib/knowledge/metadata";
import type { KnowledgeCreateInput, KnowledgePatchInput } from "@/lib/knowledge/validation";
import { AppError } from "@/lib/security/errors";

async function getAuthorizedDocument(userId: string, documentId: string, db: Database) {
  const [document] = await db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.id, documentId)).limit(1);
  if (!document) throw new AppError("RESOURCE_NOT_FOUND", 404, "Resource not found.");
  const brand = await getBrand(userId, document.brandId, db);
  if (brand.workspaceId !== document.workspaceId) throw new AppError("RESOURCE_NOT_FOUND", 404, "Resource not found.");
  return { document, brand };
}

export async function createKnowledgeDocument(userId: string, input: KnowledgeCreateInput, db: Database = getDatabase()) {
  const brand = await getBrand(userId, input.brandId, db);
  if (brand.workspaceId !== input.workspaceId) throw new AppError("RESOURCE_NOT_FOUND", 404, "Resource not found.");
  await requireWorkspaceAction(userId, input.workspaceId, "brand.write", db);
  const [document] = await db.insert(knowledgeDocuments).values({
    workspaceId: input.workspaceId,
    brandId: input.brandId,
    title: input.title,
    sourceType: input.sourceType,
    sourceName: input.sourceName || null,
    content: input.content,
    metadata: sanitizeMetadata(input.metadata),
    status: "PENDING",
  }).returning();
  if (!document) throw new AppError("KNOWLEDGE_CREATE_FAILED", 500, "Knowledge document could not be created.");
  await recordAuditEvent({ workspaceId: document.workspaceId, actorUserId: userId, action: "knowledge.created", resourceType: "knowledge", resourceId: document.id, metadata: { title: document.title } }, db);
  return document;
}

export async function listKnowledgeDocuments(userId: string, workspaceId: string, brandId: string, db: Database = getDatabase()) {
  const brand = await getBrand(userId, brandId, db);
  if (brand.workspaceId !== workspaceId) throw new AppError("RESOURCE_NOT_FOUND", 404, "Resource not found.");
  return db.select().from(knowledgeDocuments).where(and(eq(knowledgeDocuments.workspaceId, workspaceId), eq(knowledgeDocuments.brandId, brandId))).orderBy(desc(knowledgeDocuments.createdAt));
}

export async function getKnowledgeDocument(userId: string, documentId: string, db: Database = getDatabase()) {
  return (await getAuthorizedDocument(userId, documentId, db)).document;
}

export async function updateKnowledgeDocument(userId: string, documentId: string, input: KnowledgePatchInput, db: Database = getDatabase()) {
  const { document } = await getAuthorizedDocument(userId, documentId, db);
  await requireWorkspaceAction(userId, document.workspaceId, "brand.write", db);
  const nextContent = input.content ?? document.content;
  const indexedFieldsChanged = input.content !== undefined && input.content !== document.content
    || input.metadata !== undefined
    || input.sourceType !== undefined && input.sourceType !== document.sourceType
    || input.sourceName !== undefined && (input.sourceName || null) !== document.sourceName;
  const [updated] = await db.update(knowledgeDocuments).set({
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.sourceType === undefined ? {} : { sourceType: input.sourceType }),
    ...(input.sourceName === undefined ? {} : { sourceName: input.sourceName || null }),
    ...(input.content === undefined ? {} : { content: nextContent }),
    ...(input.metadata === undefined ? {} : { metadata: sanitizeMetadata(input.metadata) }),
    ...(indexedFieldsChanged ? { contentHash: null, status: "PENDING" as const, errorCode: null } : {}),
    updatedAt: new Date(),
  }).where(and(eq(knowledgeDocuments.id, document.id), eq(knowledgeDocuments.workspaceId, document.workspaceId))).returning();
  if (!updated) throw new AppError("KNOWLEDGE_UPDATE_FAILED", 500, "Knowledge document could not be updated.");
  await recordAuditEvent({ workspaceId: updated.workspaceId, actorUserId: userId, action: "knowledge.updated", resourceType: "knowledge", resourceId: updated.id, metadata: { fields: Object.keys(input) } }, db);
  return updated;
}

export async function deleteKnowledgeDocument(userId: string, documentId: string, db: Database = getDatabase()): Promise<void> {
  const { document } = await getAuthorizedDocument(userId, documentId, db);
  await requireWorkspaceAction(userId, document.workspaceId, "brand.delete", db);
  await db.transaction(async (tx) => {
    await tx.delete(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, document.id), eq(knowledgeDocuments.workspaceId, document.workspaceId)));
    await recordAuditEvent({ workspaceId: document.workspaceId, actorUserId: userId, action: "knowledge.deleted", resourceType: "knowledge", resourceId: document.id, metadata: { title: document.title } }, tx);
  });
}
