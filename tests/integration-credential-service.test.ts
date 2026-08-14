import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireWorkspaceAction, requireWorkspaceMember } from "@/lib/authz/authorization";
import { recordAuditEvent } from "@/lib/audit/service";
import { createIntegrationCredential, toSafeIntegrationCredential } from "@/lib/integrations/credentials";

vi.mock("@/lib/authz/authorization", () => ({ requireWorkspaceAction: vi.fn(), requireWorkspaceMember: vi.fn() }));
vi.mock("@/lib/audit/service", () => ({ recordAuditEvent: vi.fn() }));

const workspaceId = "11111111-1111-4111-8111-111111111111";
const credentialId = "22222222-2222-4222-8222-222222222222";
const row = {
  id: credentialId, workspaceId, connectorId: "slack" as const, name: "Marketing Slack", encryptedSecretMaterial: "ciphertext",
  keyVersion: "v1", secretVersion: 1, createdBy: "user-a", createdAt: new Date("2026-08-14T00:00:00Z"),
  updatedAt: new Date("2026-08-14T00:00:00Z"), revokedAt: null, deletedAt: null, lastUsedAt: null,
};

function database() {
  const insertReturning = vi.fn().mockResolvedValue([row]);
  const insertValues = vi.fn().mockReturnValue({ returning: insertReturning });
  const selectLimit = vi.fn().mockResolvedValue([row]);
  const selectWhere = vi.fn().mockReturnValue({ limit: selectLimit, orderBy: vi.fn().mockResolvedValue([row]) });
  const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
  return { insert: vi.fn().mockReturnValue({ values: insertValues }), select: vi.fn().mockReturnValue({ from: selectFrom }), insertValues, selectLimit };
}

describe("integration credential lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireWorkspaceAction).mockResolvedValue({ workspaceId, userId: "user-a", role: "ADMIN" } as never);
    vi.mocked(requireWorkspaceMember).mockResolvedValue({ workspaceId, userId: "user-a", role: "MEMBER" } as never);
  });

  it("returns safe projections and never exposes ciphertext", () => {
    const safe = toSafeIntegrationCredential(row);
    expect(safe).toMatchObject({ id: credentialId, connectorId: "slack", secretVersion: 1 });
    expect("encryptedSecretMaterial" in safe).toBe(false);
    expect("apiToken" in safe).toBe(false);
  });

  it("encrypts creation material and audits only safe identifiers", async () => {
    const db = database();
    await expect(createIntegrationCredential("user-a", { workspaceId, connectorId: "slack", name: "Marketing Slack", secret: { apiToken: "xoxb-secret" } }, db as never)).resolves.toMatchObject({ id: credentialId });
    expect(requireWorkspaceAction).toHaveBeenCalledWith("user-a", workspaceId, "integration.create", db);
    expect(db.insertValues).toHaveBeenCalledWith(expect.objectContaining({ workspaceId, connectorId: "slack", createdBy: "user-a", encryptedSecretMaterial: expect.any(String) }));
    expect(JSON.stringify(db.insertValues.mock.calls[0]?.[0])).not.toContain("xoxb-secret");
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "integration_credential.created", resourceType: "integration_credential", metadata: expect.not.objectContaining({ apiToken: expect.anything() }) }), db);
  });

  it("uses the workspace action boundary before credential mutation", async () => {
    vi.mocked(requireWorkspaceAction).mockRejectedValue(new Error("forbidden"));
    const db = database();
    await expect(createIntegrationCredential("user-a", { workspaceId, connectorId: "slack", name: "Marketing Slack", secret: { apiToken: "xoxb-secret" } }, db as never)).rejects.toThrow("forbidden");
    expect(db.insert).not.toHaveBeenCalled();
  });
});
