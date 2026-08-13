import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBrand } from "@/lib/brands/service";
import { requireWorkspaceAction } from "@/lib/authz/authorization";
import { recordAuditEvent } from "@/lib/audit/service";
import { AppError } from "@/lib/security/errors";
import { createKnowledgeDocument, deleteKnowledgeDocument, getKnowledgeDocument, listKnowledgeDocuments, updateKnowledgeDocument } from "@/lib/knowledge/service";

vi.mock("@/lib/brands/service", () => ({ getBrand: vi.fn() }));
vi.mock("@/lib/authz/authorization", () => ({ requireWorkspaceAction: vi.fn() }));
vi.mock("@/lib/audit/service", () => ({ recordAuditEvent: vi.fn() }));

const brandId = "22222222-2222-4222-8222-222222222222";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const foreignWorkspaceId = "33333333-3333-4333-8333-333333333333";
const documentId = "44444444-4444-4444-8444-444444444444";

const storedDocument = { id: documentId, workspaceId, brandId, title: "Product facts", sourceType: "manual", sourceName: "Notes", content: "Facts", metadata: {}, contentHash: "hash", status: "READY", errorCode: null };

function documentDatabase(row: Record<string, unknown> | null = storedDocument) {
  const updateSet = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ ...row, status: "PENDING" }]) }) });
  const deleteWhere = vi.fn().mockResolvedValue([]);
  return {
    select: vi.fn().mockReturnValue({ from: () => ({ where: () => ({ limit: vi.fn().mockResolvedValue(row ? [row] : []) }) }) }),
    update: vi.fn().mockReturnValue({ set: updateSet }),
    delete: vi.fn().mockReturnValue({ where: deleteWhere }),
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ delete: vi.fn().mockReturnValue({ where: deleteWhere }), insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }) })),
    updateSet,
    deleteWhere,
  };
}

describe("knowledge document service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBrand).mockResolvedValue({ id: brandId, workspaceId, name: "Acme" } as never);
    vi.mocked(requireWorkspaceAction).mockResolvedValue({ workspaceId, userId: "user-1", role: "ADMIN" } as never);
  });

  it("creates a pending document with sanitized metadata", async () => {
    const created = { id: "doc-1", workspaceId, brandId, status: "PENDING" };
    const values = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([created]) });
    const db = { insert: vi.fn().mockReturnValue({ values }) } as never;

    await expect(createKnowledgeDocument("user-1", {
      workspaceId,
      brandId,
      title: "Product facts",
      sourceType: "manual",
      sourceName: "Notes",
      content: "Facts",
      metadata: { source: "manual", apiKey: "never-store" },
    }, db)).resolves.toEqual(created);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ status: "PENDING", metadata: { source: "manual" } }));
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "knowledge.created", resourceType: "knowledge" }), db);
  });

  it("does not create a document when the supplied workspace does not own the brand", async () => {
    vi.mocked(getBrand).mockResolvedValue({ id: brandId, workspaceId: "33333333-3333-4333-8333-333333333333", name: "Other" } as never);
    const db = { insert: vi.fn() } as never;

    await expect(createKnowledgeDocument("user-1", {
      workspaceId,
      brandId,
      title: "Product facts",
      sourceType: "manual",
      sourceName: "",
      content: "Facts",
      metadata: {},
    }, db)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND", status: 404 });
    expect((db as { insert: ReturnType<typeof vi.fn> }).insert).not.toHaveBeenCalled();
  });

  it("does not list knowledge when the brand belongs to another workspace", async () => {
    vi.mocked(getBrand).mockResolvedValue({ id: brandId, workspaceId: foreignWorkspaceId, name: "Other" } as never);
    const db = documentDatabase();

    await expect(listKnowledgeDocuments("user-1", workspaceId, brandId, db as never)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND", status: 404 });
  });

  it("returns a non-leaking 404 for a document in an inaccessible workspace", async () => {
    vi.mocked(getBrand).mockRejectedValue(new AppError("WORKSPACE_NOT_FOUND", 404, "Workspace not found."));
    const db = documentDatabase();

    await expect(getKnowledgeDocument("outsider", documentId, db as never)).rejects.toMatchObject({ status: 404 });
  });

  it("returns a non-leaking 404 for a document that does not exist", async () => {
    const db = documentDatabase(null);

    await expect(getKnowledgeDocument("user-1", documentId, db as never)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND", status: 404 });
    expect(getBrand).not.toHaveBeenCalled();
  });

  it("requires brand write access and resets indexing state when content changes", async () => {
    const db = documentDatabase();

    const updated = await updateKnowledgeDocument("user-1", documentId, { content: "Replacement facts" }, db as never);

    expect(requireWorkspaceAction).toHaveBeenCalledWith("user-1", workspaceId, "brand.write", db);
    expect(db.updateSet).toHaveBeenCalledWith(expect.objectContaining({ content: "Replacement facts", contentHash: null, status: "PENDING", errorCode: null }));
    expect(updated.status).toBe("PENDING");
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "knowledge.updated" }), db);
  });

  it("keeps the indexed state when an update does not change content", async () => {
    const db = documentDatabase();

    await updateKnowledgeDocument("user-1", documentId, { title: "Renamed" }, db as never);

    expect(db.updateSet).toHaveBeenCalledWith(expect.not.objectContaining({ status: "PENDING" }));
  });

  it("invalidates the index when indexed metadata or source fields change", async () => {
    const db = documentDatabase();

    await updateKnowledgeDocument("user-1", documentId, { metadata: { category: "pricing" }, sourceType: "handbook", sourceName: "Updated notes" }, db as never);

    expect(db.updateSet).toHaveBeenCalledWith(expect.objectContaining({ contentHash: null, status: "PENDING", errorCode: null }));
  });

  it("does not update a document when the member lacks brand write access", async () => {
    vi.mocked(requireWorkspaceAction).mockRejectedValue(new AppError("WORKSPACE_FORBIDDEN", 403, "You do not have permission for this workspace action."));
    const db = documentDatabase();

    await expect(updateKnowledgeDocument("member", documentId, { title: "Renamed" }, db as never)).rejects.toMatchObject({ code: "WORKSPACE_FORBIDDEN", status: 403 });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("requires brand delete access and removes the document with its chunks", async () => {
    const db = documentDatabase();

    await deleteKnowledgeDocument("user-1", documentId, db as never);

    expect(requireWorkspaceAction).toHaveBeenCalledWith("user-1", workspaceId, "brand.delete", db);
    expect(db.deleteWhere).toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "knowledge.deleted" }), expect.anything());
  });
});
