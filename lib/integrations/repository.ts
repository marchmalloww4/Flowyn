import { and, desc, eq, isNull } from "drizzle-orm";
import { getDatabase, type Database, integrationCredentials } from "@/lib/database";
import type { IntegrationCredentialSafe } from "@/lib/integrations/types";

export type IntegrationCredential = typeof integrationCredentials.$inferSelect;

export function toSafeIntegrationCredential(row: IntegrationCredential): IntegrationCredentialSafe {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    connectorId: row.connectorId as IntegrationCredentialSafe["connectorId"],
    name: row.name,
    keyVersion: row.keyVersion,
    secretVersion: row.secretVersion,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    revokedAt: row.revokedAt,
    deletedAt: row.deletedAt,
    lastUsedAt: row.lastUsedAt,
  };
}

export async function getIntegrationCredentialById(id: string, workspaceId?: string, db: Database = getDatabase()): Promise<IntegrationCredential | undefined> {
  const conditions = [eq(integrationCredentials.id, id)];
  if (workspaceId) conditions.push(eq(integrationCredentials.workspaceId, workspaceId));
  const [row] = await db.select().from(integrationCredentials).where(and(...conditions)).limit(1);
  return row;
}

export async function listIntegrationCredentials(workspaceId: string, db: Database = getDatabase()): Promise<IntegrationCredentialSafe[]> {
  const rows = await db.select().from(integrationCredentials)
    .where(and(eq(integrationCredentials.workspaceId, workspaceId), isNull(integrationCredentials.deletedAt)))
    .orderBy(desc(integrationCredentials.updatedAt));
  return rows.map(toSafeIntegrationCredential);
}

export async function resolveActiveIntegrationCredential(workspaceId: string, credentialId: string, connectorId: string, db: Database = getDatabase()): Promise<IntegrationCredential | undefined> {
  const [row] = await db.select().from(integrationCredentials).where(and(
    eq(integrationCredentials.id, credentialId),
    eq(integrationCredentials.workspaceId, workspaceId),
    eq(integrationCredentials.connectorId, connectorId),
    isNull(integrationCredentials.revokedAt),
    isNull(integrationCredentials.deletedAt),
  )).limit(1);
  return row;
}

export async function markIntegrationCredentialUsed(credentialId: string, workspaceId: string, db: Database = getDatabase(), now = new Date()): Promise<void> {
  await db.update(integrationCredentials).set({ lastUsedAt: now }).where(and(eq(integrationCredentials.id, credentialId), eq(integrationCredentials.workspaceId, workspaceId), isNull(integrationCredentials.deletedAt)));
}
