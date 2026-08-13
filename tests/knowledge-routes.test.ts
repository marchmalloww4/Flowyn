import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/auth/session";
import { createKnowledgeDocument, deleteKnowledgeDocument, getKnowledgeDocument, listKnowledgeDocuments, updateKnowledgeDocument } from "@/lib/knowledge/service";
import { indexKnowledgeDocument } from "@/lib/knowledge/indexing";
import { retrieveKnowledge } from "@/lib/knowledge/retrieval";

vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/knowledge/service", () => ({ createKnowledgeDocument: vi.fn(), deleteKnowledgeDocument: vi.fn(), getKnowledgeDocument: vi.fn(), listKnowledgeDocuments: vi.fn(), updateKnowledgeDocument: vi.fn() }));
vi.mock("@/lib/knowledge/indexing", () => ({ indexKnowledgeDocument: vi.fn() }));
vi.mock("@/lib/knowledge/retrieval", () => ({ retrieveKnowledge: vi.fn() }));

import { GET as listGet, POST as createPost } from "@/app/api/knowledge/route";
import { DELETE as documentDelete, GET as documentGet, PATCH as documentPatch } from "@/app/api/knowledge/[id]/route";
import { POST as reindexPost } from "@/app/api/knowledge/[id]/reindex/route";
import { POST as retrievePost } from "@/app/api/knowledge/retrieve/route";
import { AppError } from "@/lib/security/errors";
import { DimensionMismatchError, ProviderUnavailableError, RequestTimeoutError } from "@/lib/embeddings/errors";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const brandId = "22222222-2222-4222-8222-222222222222";
const documentId = "44444444-4444-4444-8444-444444444444";
const routeContext = { params: Promise.resolve({ id: documentId }) };

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

describe("knowledge routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({ id: "user-1", email: "user@example.com" } as never);
    vi.mocked(createKnowledgeDocument).mockResolvedValue({ id: "doc-1", workspaceId, brandId, status: "PENDING" } as never);
    vi.mocked(indexKnowledgeDocument).mockResolvedValue({ id: "doc-1", workspaceId, brandId, status: "READY" } as never);
    vi.mocked(listKnowledgeDocuments).mockResolvedValue([] as never);
    vi.mocked(retrieveKnowledge).mockResolvedValue([{ documentId: "doc-1", title: "Facts", sourceType: "manual", sourceName: "Notes", stableKey: "key", content: "Fact", metadata: {}, similarity: 0.9 }]);
  });

  it("lists knowledge only through the authorized workspace and brand service", async () => {
    const response = await listGet(new Request(`http://localhost/api/knowledge?workspaceId=${workspaceId}&brandId=${brandId}`));

    expect(response.status).toBe(200);
    expect(listKnowledgeDocuments).toHaveBeenCalledWith("user-1", workspaceId, brandId);
  });

  it("creates and indexes manual knowledge without returning embeddings", async () => {
    const response = await createPost(new Request("http://localhost/api/knowledge", { method: "POST", body: JSON.stringify({ workspaceId, brandId, title: "Facts", content: "Fact", metadata: {} }), headers: { "Content-Type": "application/json" } }));
    const body = await response.json() as { document: { status: string; embedding?: unknown } };

    expect(response.status).toBe(201);
    expect(indexKnowledgeDocument).toHaveBeenCalledWith("user-1", "doc-1");
    expect(body.document).not.toHaveProperty("embedding");
  });

  it("retrieves bounded results without exposing embeddings", async () => {
    const response = await retrievePost(new Request("http://localhost/api/knowledge/retrieve", { method: "POST", body: JSON.stringify({ brandId, query: "facts", topK: 3 }), headers: { "Content-Type": "application/json" } }));
    const body = await response.json() as { results: Array<{ embedding?: unknown }> };

    expect(response.status).toBe(200);
    expect(body.results[0]).not.toHaveProperty("embedding");
  });

  it("rejects unauthenticated knowledge access without calling the services", async () => {
    vi.mocked(requireUser).mockRejectedValue(new AppError("UNAUTHENTICATED", 401, "Authentication is required."));

    const response = await listGet(new Request(`http://localhost/api/knowledge?workspaceId=${workspaceId}&brandId=${brandId}`));

    expect(response.status).toBe(401);
    expect(listKnowledgeDocuments).not.toHaveBeenCalled();
  });

  it("rejects a malformed create body before reaching the service", async () => {
    const response = await createPost(jsonRequest("http://localhost/api/knowledge", "POST", { workspaceId, brandId, title: "", content: "" }));
    const body = await response.json() as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(createKnowledgeDocument).not.toHaveBeenCalled();
  });

  it("rejects a create body that carries unexpected keys", async () => {
    const response = await createPost(jsonRequest("http://localhost/api/knowledge", "POST", { workspaceId, brandId, title: "Facts", content: "Fact", status: "READY" }));

    expect(response.status).toBe(400);
    expect(createKnowledgeDocument).not.toHaveBeenCalled();
  });

  it("rejects a list request without a workspace and brand", async () => {
    const response = await listGet(new Request("http://localhost/api/knowledge"));

    expect(response.status).toBe(400);
    expect(listKnowledgeDocuments).not.toHaveBeenCalled();
  });

  it("returns the persisted document when synchronous indexing fails", async () => {
    vi.mocked(indexKnowledgeDocument).mockRejectedValue(new ProviderUnavailableError());
    vi.mocked(getKnowledgeDocument).mockResolvedValue({ id: "doc-1", workspaceId, brandId, status: "FAILED", errorCode: "PROVIDER_UNAVAILABLE" } as never);

    const response = await createPost(jsonRequest("http://localhost/api/knowledge", "POST", { workspaceId, brandId, title: "Facts", content: "Fact", metadata: {} }));
    const body = await response.json() as { document: { status: string; errorCode: string } };

    expect(response.status).toBe(201);
    expect(body.document.status).toBe("FAILED");
    expect(body.document.errorCode).toBe("PROVIDER_UNAVAILABLE");
  });

  it("does not leak the existence of a document in another workspace", async () => {
    vi.mocked(getKnowledgeDocument).mockRejectedValue(new AppError("RESOURCE_NOT_FOUND", 404, "Resource not found."));

    const response = await documentGet(new Request(`http://localhost/api/knowledge/${documentId}`), routeContext);
    const body = await response.json() as { error: { code: string; message: string } };

    expect(response.status).toBe(404);
    expect(body.error.message).toBe("Resource not found.");
  });

  it("patches a document without accepting a client supplied workspace or brand", async () => {
    vi.mocked(updateKnowledgeDocument).mockResolvedValue({ id: documentId, workspaceId, brandId, status: "PENDING" } as never);

    const rejected = await documentPatch(jsonRequest(`http://localhost/api/knowledge/${documentId}`, "PATCH", { title: "Renamed", workspaceId }), routeContext);
    expect(rejected.status).toBe(400);
    expect(updateKnowledgeDocument).not.toHaveBeenCalled();

    const accepted = await documentPatch(jsonRequest(`http://localhost/api/knowledge/${documentId}`, "PATCH", { title: "Renamed" }), routeContext);
    expect(accepted.status).toBe(200);
    expect(updateKnowledgeDocument).toHaveBeenCalledWith("user-1", documentId, { title: "Renamed" });
  });

  it("deletes a document through the authorized service", async () => {
    vi.mocked(deleteKnowledgeDocument).mockResolvedValue(undefined);

    const response = await documentDelete(new Request(`http://localhost/api/knowledge/${documentId}`, { method: "DELETE" }), routeContext);

    expect(response.status).toBe(204);
    expect(deleteKnowledgeDocument).toHaveBeenCalledWith("user-1", documentId);
  });

  it("re-indexes a document through the authorized service", async () => {
    const response = await reindexPost(new Request(`http://localhost/api/knowledge/${documentId}/reindex`, { method: "POST" }), routeContext);
    const body = await response.json() as { document: { status: string; embedding?: unknown } };

    expect(response.status).toBe(200);
    expect(indexKnowledgeDocument).toHaveBeenCalledWith("user-1", documentId);
    expect(body.document.status).toBe("READY");
    expect(body.document).not.toHaveProperty("embedding");
  });

  it("maps a re-index provider timeout to a safe 503 response", async () => {
    vi.mocked(indexKnowledgeDocument).mockRejectedValue(new RequestTimeoutError());

    const response = await reindexPost(new Request(`http://localhost/api/knowledge/${documentId}/reindex`), routeContext);
    const body = await response.json() as { error: { code: string; message: string } };

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("REQUEST_TIMEOUT");
    expect(body.error.message).not.toContain("Ollama");
  });

  it("maps a retrieval dimension mismatch to a safe 502 response", async () => {
    vi.mocked(retrieveKnowledge).mockRejectedValue(new DimensionMismatchError(768, 1536));

    const response = await retrievePost(jsonRequest("http://localhost/api/knowledge/retrieve", "POST", { brandId, query: "facts" }));
    const body = await response.json() as { error: { code: string; message: string } };

    expect(response.status).toBe(502);
    expect(body.error.code).toBe("DIMENSION_MISMATCH");
    expect(body.error.message).not.toContain("1536");
  });

  it("rejects a retrieval top-K outside the bounded range", async () => {
    const response = await retrievePost(jsonRequest("http://localhost/api/knowledge/retrieve", "POST", { brandId, query: "facts", topK: 500 }));

    expect(response.status).toBe(400);
    expect(retrieveKnowledge).not.toHaveBeenCalled();
  });

  it("applies the default bounded top-K and never trusts a client workspace", async () => {
    const rejected = await retrievePost(jsonRequest("http://localhost/api/knowledge/retrieve", "POST", { brandId, query: "facts", workspaceId }));
    expect(rejected.status).toBe(400);

    const response = await retrievePost(jsonRequest("http://localhost/api/knowledge/retrieve", "POST", { brandId, query: "facts" }));

    expect(response.status).toBe(200);
    expect(retrieveKnowledge).toHaveBeenCalledWith({ userId: "user-1", brandId, query: "facts", topK: 5 });
  });
});
