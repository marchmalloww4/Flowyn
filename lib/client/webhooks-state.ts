export type WebhookRecord = { id: string; workspaceId: string; enabled: boolean; name: string };

export function filterWorkspaceWebhooks(webhooks: WebhookRecord[], workspaceId: string): WebhookRecord[] {
  return webhooks.filter((webhook) => webhook.workspaceId === workspaceId);
}

export function canManageWebhooks(role: string | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}
