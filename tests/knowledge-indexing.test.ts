import { beforeEach, describe, expect, it, vi } from "vitest";
import { getKnowledgeDocument } from "@/lib/knowledge/service";
import { requireWorkspaceAction } from "@/lib/authz/authorization";
import { hashKnowledgeContent, indexKnowledgeDocument } from "@/lib/knowledge/indexing";
import { ProviderUnavailableError } from "@/lib/embeddings/errors";
import { AppError } from "@/lib/security/errors";
import type { EmbeddingProvider } from "@/lib/embeddings/types";

vi.mock("@/lib/knowledge/service", () => ({ getKnowledgeDocument: vi.fn() }));
vi.mock("@/lib/authz/authorization", () => ({ requireWorkspaceAction: vi.fn() }));
vi.mock("@/lib/audit/service", () => ({ recordAuditEvent: vi.fn() }));

const documentId = "44444444-4444-4444-8444-444444444444";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const brandId = "22222222-2222-4222-8222-222222222222";

function database(readyRow: Record<string, unknown> = { id: documentId, workspaceId, brandId, status: "READY", updatedAt: new Date("2026-08-14T00:00:00.000Z") }, finalUpdateRows: Record<string, unknown>[] = [readyRow]) {
  const updateValues = vi.fn().mockImplementation((values: Record<string, unknown>) => ({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ ...readyRow, ...values, updatedAt: values.updatedAt ?? readyRow.updatedAt }]) }) }));
  const transactionUpdateValues = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(finalUpdateRows) }) });
  const deleteWhere = vi.fn().mockResolvedValue([]);
  const insertValues = vi.fn().mockResolvedValue([]);
  const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ delete: vi.fn().mockReturnValue({ where: deleteWhere }), insert: vi.fn().mockReturnValue({ values: insertValues }), update: vi.fn().mockReturnValue({ set: transactionUpdateValues }) }));
  return { updateValues, deleteWhere, insertValues, transaction, update: vi.fn().mockReturnValue({ set: updateValues }) };
}

describe("knowledge indexing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireWorkspaceAction).mockResolvedValue({ workspaceId, userId: "user-1", role: "ADMIN" } as never);
  });

  it("skips embedding unchanged ready documents", async () => {
    const content = "Stable content";
    vi.mocked(getKnowledgeDocument).mockResolvedValue({ id: documentId, workspaceId, brandId, content, status: "READY", contentHash: hashKnowledgeContent(content), updatedAt: new Date("2026-08-14T00:00:00.000Z") } as never);
    const provider: EmbeddingProvider = { embedText: vi.fn(), embedDocuments: vi.fn() };
    const db = database();

    await expect(indexKnowledgeDocument("user-1", documentId, db as never, provider)).resolves.toMatchObject({ status: "READY" });
    expect(provider.embedDocuments).not.toHaveBeenCalled();
  });

  it("replaces chunks and marks a changed document ready", async () => {
    vi.mocked(getKnowledgeDocument).mockResolvedValue({ id: documentId, workspaceId, brandId, content: "New content for indexing", status: "PENDING", contentHash: null, metadata: {}, title: "Facts", sourceType: "manual", sourceName: null, updatedAt: new Date("2026-08-14T00:00:00.000Z") } as never);
    const provider: EmbeddingProvider = { embedText: vi.fn(), embedDocuments: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]) };
    const db = database();

    await expect(indexKnowledgeDocument("user-1", documentId, db as never, provider)).resolves.toMatchObject({ status: "READY" });
    expect(provider.embedDocuments).toHaveBeenCalled();
    expect(db.transaction).toHaveBeenCalled();
    expect(db.insertValues).toHaveBeenCalled();
  });

  it("marks a document FAILED with a safe error code and stores no partial chunks", async () => {
    vi.mocked(getKnowledgeDocument).mockResolvedValue({ id: documentId, workspaceId, brandId, content: "New content for indexing", status: "PENDING", contentHash: null, metadata: {}, title: "Facts", sourceType: "manual", sourceName: null, updatedAt: new Date("2026-08-14T00:00:00.000Z") } as never);
    const provider: EmbeddingProvider = { embedText: vi.fn(), embedDocuments: vi.fn().mockRejectedValue(new ProviderUnavailableError()) };
    const db = database();

    await expect(indexKnowledgeDocument("user-1", documentId, db as never, provider)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.insertValues).not.toHaveBeenCalled();
    expect(db.updateValues).toHaveBeenLastCalledWith(expect.objectContaining({ status: "FAILED", errorCode: "PROVIDER_UNAVAILABLE" }));
  });

  it("refuses to index when the caller cannot write to the brand workspace", async () => {
    vi.mocked(getKnowledgeDocument).mockResolvedValue({ id: documentId, workspaceId, brandId, content: "New content for indexing", status: "PENDING", contentHash: null, metadata: {}, updatedAt: new Date("2026-08-14T00:00:00.000Z") } as never);
    vi.mocked(requireWorkspaceAction).mockRejectedValue(new AppError("WORKSPACE_FORBIDDEN", 403, "You do not have permission for this workspace action."));
    const provider: EmbeddingProvider = { embedText: vi.fn(), embedDocuments: vi.fn() };
    const db = database();

    await expect(indexKnowledgeDocument("member", documentId, db as never, provider)).rejects.toMatchObject({ code: "WORKSPACE_FORBIDDEN", status: 403 });
    expect(provider.embedDocuments).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("does not replace chunks when the document changed while embedding was in flight", async () => {
    const updatedAt = new Date("2026-08-14T00:00:00.000Z");
    vi.mocked(getKnowledgeDocument).mockResolvedValue({ id: documentId, workspaceId, brandId, content: "Older content", status: "PENDING", contentHash: null, metadata: {}, title: "Facts", sourceType: "manual", sourceName: null, updatedAt } as never);
    const provider: EmbeddingProvider = { embedText: vi.fn(), embedDocuments: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]) };
    const db = database({ id: documentId, workspaceId, brandId, status: "READY", updatedAt }, []);

    await expect(indexKnowledgeDocument("user-1", documentId, db as never, provider)).rejects.toMatchObject({ code: "KNOWLEDGE_INDEX_STALE", status: 409 });
    expect(db.insertValues).not.toHaveBeenCalled();
    expect(db.deleteWhere).not.toHaveBeenCalled();
  });
});
