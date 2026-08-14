import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { requireWorkspaceAction, requireWorkspaceMember } from "@/lib/authz/authorization";
import { recordAuditEvent } from "@/lib/audit/service";
import { getDatabase, integrationCredentials, type Database } from "@/lib/database";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/security/errors";
import { parseSecretKeyring, type IntegrationSecretContext } from "@/lib/security/keyring";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "@/lib/security/secrets";
import { getConnectorDefinition, parseConnectorSecret } from "@/lib/integrations/registry";
import { integrationCredentialCreateSchema, integrationCredentialPatchSchema, integrationCredentialRotateSchema } from "@/lib/integrations/validation";
import { getIntegrationCredentialById, listIntegrationCredentials as listRepositoryCredentials, resolveActiveIntegrationCredential as resolveRepositoryCredential, toSafeIntegrationCredential, type IntegrationCredential } from "@/lib/integrations/repository";
import type { IntegrationCredentialSafe, IntegrationSecretMaterial } from "@/lib/integrations/types";

function notFound(): AppError {
  return new AppError("INTEGRATION_CREDENTIAL_NOT_FOUND", 404, "Integration credential not found.");
}

function secretContext(row: Pick<IntegrationCredential, "id" | "connectorId" | "secretVersion">): IntegrationSecretContext {
  const env = getEnv();
  return {
    keyring: parseSecretKeyring(env.INTEGRATION_CREDENTIAL_KEYRING_JSON),
    currentKeyVersion: env.INTEGRATION_CREDENTIAL_CURRENT_KEY_VERSION,
    connectorId: row.connectorId,
    credentialId: row.id,
    secretVersion: row.secretVersion,
  };
}

function encryptMaterial(material: IntegrationSecretMaterial, row: Pick<IntegrationCredential, "id" | "connectorId" | "secretVersion">) {
  getConnectorDefinition(row.connectorId).credentialSchema.parse(material);
  return encryptIntegrationSecret(JSON.stringify(material), secretContext(row));
}

export function decryptIntegrationCredentialSecret(row: IntegrationCredential): IntegrationSecretMaterial {
  try {
    const material = JSON.parse(decryptIntegrationSecret(row.encryptedSecretMaterial, secretContext(row))) as unknown;
    return parseConnectorSecret(row.connectorId, material);
  } catch {
    throw new AppError("INTEGRATION_CREDENTIAL_INVALID", 500, "The integration credential could not be used.");
  }
}

export { toSafeIntegrationCredential };

export async function createIntegrationCredential(userId: string, input: unknown, db: Database = getDatabase()): Promise<IntegrationCredentialSafe> {
  const parsed = integrationCredentialCreateSchema.parse(input);
  await requireWorkspaceAction(userId, parsed.workspaceId, "integration.create", db);
  const id = randomUUID();
  const createdAt = new Date();
  const encryptedSecretMaterial = encryptMaterial(parsed.secret, { id, connectorId: parsed.connectorId, secretVersion: 1 });
  const [created] = await db.insert(integrationCredentials).values({
    id,
    workspaceId: parsed.workspaceId,
    connectorId: parsed.connectorId,
    name: parsed.name,
    encryptedSecretMaterial,
    keyVersion: getEnv().INTEGRATION_CREDENTIAL_CURRENT_KEY_VERSION,
    secretVersion: 1,
    createdBy: userId,
    createdAt,
    updatedAt: createdAt,
  }).returning();
  if (!created) throw new AppError("INTEGRATION_CREDENTIAL_CREATE_FAILED", 500, "Integration credential could not be created.");
  await recordAuditEvent({ workspaceId: created.workspaceId, actorUserId: userId, action: "integration_credential.created", resourceType: "integration_credential", resourceId: created.id, metadata: { connectorId: created.connectorId, name: created.name, secretVersion: created.secretVersion } }, db);
  return toSafeIntegrationCredential(created);
}

export async function listIntegrationCredentials(userId: string, workspaceId: string, db: Database = getDatabase()): Promise<IntegrationCredentialSafe[]> {
  await requireWorkspaceAction(userId, workspaceId, "integration.read", db);
  return listRepositoryCredentials(workspaceId, db);
}

export async function getIntegrationCredential(userId: string, credentialId: string, db: Database = getDatabase()): Promise<IntegrationCredentialSafe> {
  const row = await getIntegrationCredentialById(credentialId, undefined, db);
  if (!row) throw notFound();
  await requireWorkspaceAction(userId, row.workspaceId, "integration.read", db);
  return toSafeIntegrationCredential(row);
}

export async function updateIntegrationCredential(userId: string, credentialId: string, input: unknown, db: Database = getDatabase()): Promise<IntegrationCredentialSafe> {
  const parsed = integrationCredentialPatchSchema.parse(input);
  const existing = await getIntegrationCredentialById(credentialId, undefined, db);
  if (!existing || existing.deletedAt) throw notFound();
  await requireWorkspaceAction(userId, existing.workspaceId, "integration.update", db);
  const [updated] = await db.update(integrationCredentials).set({ name: parsed.name, updatedAt: new Date() }).where(and(eq(integrationCredentials.id, existing.id), eq(integrationCredentials.workspaceId, existing.workspaceId), isNull(integrationCredentials.deletedAt))).returning();
  if (!updated) throw new AppError("INTEGRATION_CREDENTIAL_UPDATE_FAILED", 500, "Integration credential could not be updated.");
  await recordAuditEvent({ workspaceId: updated.workspaceId, actorUserId: userId, action: "integration_credential.updated", resourceType: "integration_credential", resourceId: updated.id, metadata: { fields: ["name"] } }, db);
  return toSafeIntegrationCredential(updated);
}

export async function rotateIntegrationCredential(userId: string, credentialId: string, input: unknown, db: Database = getDatabase()): Promise<IntegrationCredentialSafe> {
  const parsed = integrationCredentialRotateSchema.parse(input);
  const existing = await getIntegrationCredentialById(credentialId, undefined, db);
  if (!existing || existing.deletedAt) throw notFound();
  await requireWorkspaceAction(userId, existing.workspaceId, "integration.rotate_secret", db);
  const secretVersion = existing.secretVersion + 1;
  const encryptedSecretMaterial = encryptMaterial(parsed.secret, { id: existing.id, connectorId: existing.connectorId, secretVersion });
  const [updated] = await db.update(integrationCredentials).set({ encryptedSecretMaterial, keyVersion: getEnv().INTEGRATION_CREDENTIAL_CURRENT_KEY_VERSION, secretVersion, updatedAt: new Date(), revokedAt: null }).where(and(eq(integrationCredentials.id, existing.id), eq(integrationCredentials.workspaceId, existing.workspaceId), isNull(integrationCredentials.deletedAt))).returning();
  if (!updated) throw new AppError("INTEGRATION_CREDENTIAL_ROTATE_FAILED", 500, "Integration credential could not be rotated.");
  await recordAuditEvent({ workspaceId: updated.workspaceId, actorUserId: userId, action: "integration_credential.secret_rotated", resourceType: "integration_credential", resourceId: updated.id, metadata: { secretVersion } }, db);
  return toSafeIntegrationCredential(updated);
}

export async function revokeIntegrationCredential(userId: string, credentialId: string, db: Database = getDatabase()): Promise<void> {
  const existing = await getIntegrationCredentialById(credentialId, undefined, db);
  if (!existing || existing.deletedAt) throw notFound();
  await requireWorkspaceAction(userId, existing.workspaceId, "integration.delete", db);
  const now = new Date();
  const [updated] = await db.update(integrationCredentials).set({ revokedAt: now, deletedAt: now, updatedAt: now }).where(and(eq(integrationCredentials.id, existing.id), eq(integrationCredentials.workspaceId, existing.workspaceId), isNull(integrationCredentials.deletedAt))).returning();
  if (!updated) throw new AppError("INTEGRATION_CREDENTIAL_DELETE_FAILED", 500, "Integration credential could not be revoked.");
  await recordAuditEvent({ workspaceId: updated.workspaceId, actorUserId: userId, action: "integration_credential.revoked", resourceType: "integration_credential", resourceId: updated.id, metadata: { connectorId: updated.connectorId } }, db);
}

export async function resolveActiveIntegrationCredential(workspaceId: string, credentialId: string, connectorId: string, db: Database = getDatabase()): Promise<IntegrationCredential> {
  const row = await resolveRepositoryCredential(workspaceId, credentialId, connectorId, db);
  if (!row) throw new AppError("INTEGRATION_CREDENTIAL_UNAVAILABLE", 409, "The integration credential is unavailable.");
  return row;
}

export async function assertCredentialWorkspaceAccess(userId: string, workspaceId: string, db: Database = getDatabase()): Promise<void> {
  await requireWorkspaceMember(userId, workspaceId, db);
}
