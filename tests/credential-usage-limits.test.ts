import { beforeEach, describe, expect, it, vi } from "vitest";

const policy = vi.hoisted(() => ({ getWorkspaceUsagePolicy: vi.fn().mockReturnValue({ plan: "SELF_HOSTED", workspaceId: "workspace-a", limits: { integrationCredentials: 1 } }) }));
vi.mock("@/lib/usage/policy", () => policy);
vi.mock("@/lib/authz/authorization", () => ({ requireWorkspaceAction: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/audit/service", () => ({ recordAuditEvent: vi.fn().mockResolvedValue(undefined) }));

import { createIntegrationCredential } from "@/lib/integrations/credentials";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const row = { id: "22222222-2222-4222-8222-222222222222", workspaceId, connectorId: "slack", name: "Slack", encryptedSecretMaterial: "ciphertext", keyVersion: "v1", secretVersion: 1, createdBy: "user-a", createdAt: new Date(), updatedAt: new Date(), revokedAt: null, deletedAt: null, lastUsedAt: null };

function database(activeCredentials: number) {
  const tx = {
    select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ for: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: "workspace-a" }]) }), limit: vi.fn().mockResolvedValue([{ activeCredentials }]) }) }) }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([row]) }) }),
  };
  return { transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)), tx };
}

describe("integration credential limits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a new credential when active credential capacity is full", async () => {
    const db = database(1);
    await expect(createIntegrationCredential("user-a", { workspaceId, connectorId: "slack", name: "Slack", secret: { apiToken: "xoxb-secret" } }, db as never)).rejects.toMatchObject({ code: "WORKSPACE_QUOTA_EXCEEDED", status: 429 });
    expect(db.tx.insert).not.toHaveBeenCalled();
  });
});
