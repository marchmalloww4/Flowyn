export function canManageWorkspace(role: string | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function canManageMemberships(role: string | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function settingsRoleLabel(role: string): string {
  if (role === "OWNER") return "Owner";
  if (role === "ADMIN") return "Administrator";
  return "Member";
}
