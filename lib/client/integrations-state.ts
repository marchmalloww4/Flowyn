export function canManageCredentials(role: string | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function integrationCredentialLabel(credential: { connectorId: string; name: string; secretVersion: number }): string {
  return `${credential.name} · ${credential.connectorId} · secret version ${credential.secretVersion}`;
}
