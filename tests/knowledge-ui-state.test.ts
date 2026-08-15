import { describe, expect, it } from "vitest";
import { filterWorkspaceDocuments, knowledgeStatusPresentation, type KnowledgeDocumentRecord } from "@/lib/client/knowledge-state";

const documents: KnowledgeDocumentRecord[] = [
  { id: "doc-ready", workspaceId: "workspace-a", brandId: "brand-a", status: "READY" },
  { id: "doc-other", workspaceId: "workspace-b", brandId: "brand-b", status: "FAILED" },
];

describe("knowledge presentation state", () => {
  it("renders distinct safe status text for every indexing transition", () => {
    expect(knowledgeStatusPresentation("READY").label).toBe("Ready");
    expect(knowledgeStatusPresentation("PENDING").label).toBe("Queued");
    expect(knowledgeStatusPresentation("PROCESSING").label).toBe("Indexing");
    expect(knowledgeStatusPresentation("FAILED").label).toBe("Indexing failed");
  });

  it("filters documents by both workspace and brand before rendering", () => {
    expect(filterWorkspaceDocuments(documents, "workspace-a", "brand-a").map((document) => document.id)).toEqual(["doc-ready"]);
    expect(filterWorkspaceDocuments(documents, "workspace-a", "brand-b")).toEqual([]);
  });
});
