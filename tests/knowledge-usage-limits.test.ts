import { beforeEach, describe, expect, it, vi } from "vitest";

const usage = vi.hoisted(() => ({
  getWorkspaceUsagePolicy: vi.fn().mockReturnValue({ plan: "SELF_HOSTED", workspaceId: "workspace-a", limits: { knowledgeDocuments: 2, knowledgeCharacters: 10 } }),
}));
vi.mock("@/lib/usage/policy", () => usage);
vi.mock("@/lib/brands/service", () => ({ getBrand: vi.fn().mockResolvedValue({ id: "brand-a", workspaceId: "workspace-a" }) }));
vi.mock("@/lib/authz/authorization", () => ({ requireWorkspaceAction: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/audit/service", () => ({ recordAuditEvent: vi.fn().mockResolvedValue(undefined) }));

import { createKnowledgeDocument } from "@/lib/knowledge/service";

const input = { workspaceId: "workspace-a", brandId: "brand-a", title: "Facts", sourceType: "manual", sourceName: "notes", content: "12345", metadata: {} };

function database(documentCount: number, characterCount: number) {
  const created = { id: "doc-a", workspaceId: "workspace-a", brandId: "brand-a", title: "Facts", content: input.content, status: "PENDING" };
  const tx = {
    select: vi.fn().mockImplementation((selection?: unknown) => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          for: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: "workspace-a" }]) }),
          limit: vi.fn().mockResolvedValue(selection ? [{ documentCount, characterCount }] : [{ id: "workspace-a" }]),
        }),
      }),
    })),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([created]) }) }),
  };
  return { transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)), tx };
}

describe("knowledge workspace limits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a document when the workspace document count is full", async () => {
    const db = database(2, 0);
    await expect(createKnowledgeDocument("user-a", input, db as never)).rejects.toMatchObject({ code: "WORKSPACE_QUOTA_EXCEEDED", status: 429 });
    expect(db.tx.insert).not.toHaveBeenCalled();
  });

  it("rejects a document when the workspace character budget would be exceeded", async () => {
    const db = database(1, 8);
    await expect(createKnowledgeDocument("user-a", input, db as never)).rejects.toMatchObject({ code: "WORKSPACE_QUOTA_EXCEEDED", status: 429 });
    expect(db.tx.insert).not.toHaveBeenCalled();
  });
});
