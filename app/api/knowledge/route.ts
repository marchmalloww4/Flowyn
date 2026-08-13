import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { errorResponse, readJson } from "@/lib/http";
import { createKnowledgeDocument, getKnowledgeDocument, listKnowledgeDocuments } from "@/lib/knowledge/service";
import { indexKnowledgeDocument } from "@/lib/knowledge/indexing";
import { EmbeddingError } from "@/lib/embeddings/errors";
import { knowledgeCreateSchema, knowledgeListQuerySchema } from "@/lib/knowledge/validation";

export async function GET(request: Request) {
  try {
    const currentUser = await requireUser(request.headers);
    const search = new URL(request.url).searchParams;
    const input = knowledgeListQuerySchema.parse({ workspaceId: search.get("workspaceId"), brandId: search.get("brandId") });
    return NextResponse.json({ documents: await listKnowledgeDocuments(currentUser.id, input.workspaceId, input.brandId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireUser(request.headers);
    const input = await readJson(request, knowledgeCreateSchema);
    const document = await createKnowledgeDocument(currentUser.id, input);
    // The document is persisted before indexing, so a provider failure is reported through its
    // FAILED status and error code rather than hiding a created resource behind an error response.
    const indexed = await indexKnowledgeDocument(currentUser.id, document.id).catch((error: unknown) => {
      if (error instanceof EmbeddingError) return getKnowledgeDocument(currentUser.id, document.id);
      throw error;
    });
    return NextResponse.json({ document: indexed }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
