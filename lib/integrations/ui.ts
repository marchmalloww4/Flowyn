import type { WorkspaceRole } from "@/lib/workspaces/roles";

export function canManageIntegrationCredentials(role: WorkspaceRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function integrationCredentialStatus(credential: { revokedAt: string | null; deletedAt?: string | null }): "Active" | "Revoked" {
  return credential.revokedAt || credential.deletedAt ? "Revoked" : "Active";
}
