export type KnowledgeStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

export type KnowledgeDocumentRecord = {
  id: string;
  workspaceId: string;
  brandId: string;
  status: KnowledgeStatus;
};

export function filterWorkspaceDocuments(documents: KnowledgeDocumentRecord[], workspaceId: string, brandId: string): KnowledgeDocumentRecord[] {
  return documents.filter((document) => document.workspaceId === workspaceId && document.brandId === brandId);
}

export function knowledgeStatusPresentation(status: KnowledgeStatus): { label: string; tone: "neutral" | "success" | "warning" | "danger" } {
  if (status === "READY") return { label: "Ready", tone: "success" };
  if (status === "FAILED") return { label: "Indexing failed", tone: "danger" };
  if (status === "PROCESSING") return { label: "Indexing", tone: "warning" };
  return { label: "Queued", tone: "neutral" };
}
