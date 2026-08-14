import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { requireWorkspaceAction } from "@/lib/authz/authorization";
import { getWorkflow } from "@/lib/workflows/service";
import { recordAuditEvent } from "@/lib/audit/service";
import { createWorkflowWebhook, rotateWorkflowWebhookSecret, updateWorkflowWebhook } from "@/lib/webhooks/service";

vi.mock("@/lib/authz/authorization", () => ({ requireWorkspaceAction: vi.fn() }));
vi.mock("@/lib/workflows/service", () => ({ getWorkflow: vi.fn() }));
vi.mock("@/lib/audit/service", () => ({ recordAuditEvent: vi.fn() }));

const workspaceId = "11111111-1111-4111-8111-111111111111";
const workflowId = "22222222-2222-4222-8222-222222222222";
const triggerId = "33333333-3333-4333-8333-333333333333";
const userId = "user-1";
const workflow = { id: workflowId, workspaceId, enabled: true, deletedAt: null, currentVersion: 1 };
const trigger = {
  id: triggerId, workspaceId, workflowId, publicId: "public-id", name: "Inbound", enabled: true,
  secretCiphertext: "ciphertext", secretKeyVersion: "v1", secretVersion: 1, createdBy: userId,
  createdAt: new Date("2026-08-14T00:00:00Z"), updatedAt: new Date("2026-08-14T00:00:00Z"), deletedAt: null,
};

function database() {
  const returned = { ...trigger };
  const select = vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([returned]) }) }) });
  const insert = vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([returned]) }) });
  const update = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ ...returned, secretVersion: 2 }]) }) }) });
  return { select, insert, update };
}

describe("workflow webhook service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireWorkspaceAction).mockResolvedValue({ workspaceId, userId, role: "ADMIN" } as never);
    vi.mocked(getWorkflow).mockResolvedValue(workflow as never);
  });

  it("creates a trigger and returns the secret only in the create result", async () => {
    const result = await createWorkflowWebhook(userId, { workspaceId, workflowId, name: "Inbound" }, database() as never);
    expect(result.secret).toMatch(/^whsec_/);
    expect(result.trigger).toMatchObject({ id: triggerId, publicId: "public-id" });
    expect("secretCiphertext" in result.trigger).toBe(false);
    expect(requireWorkspaceAction).toHaveBeenCalledWith(userId, workspaceId, "workflow_webhook.create", expect.anything());
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "workflow_webhook.created" }), expect.anything());
  });

  it("rotates secrets without returning the encrypted value", async () => {
    const result = await rotateWorkflowWebhookSecret(userId, triggerId, database() as never);
    expect(result.secret).toMatch(/^whsec_/);
    expect("secretCiphertext" in result.trigger).toBe(false);
    expect(requireWorkspaceAction).toHaveBeenCalledWith(userId, workspaceId, "workflow_webhook.rotate_secret", expect.anything());
  });

  it("rejects secret fields from updates", async () => {
    await expect(updateWorkflowWebhook(userId, triggerId, { secret: "forged" } as never, database() as never)).rejects.toBeInstanceOf(ZodError);
  });
});
