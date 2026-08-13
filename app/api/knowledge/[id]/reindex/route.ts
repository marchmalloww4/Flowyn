import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http";
import { indexKnowledgeDocument } from "@/lib/knowledge/indexing";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const currentUser = await requireUser(request.headers);
    const { id } = await context.params;
    return NextResponse.json({ document: await indexKnowledgeDocument(currentUser.id, id) });
  } catch (error) {
    return errorResponse(error);
  }
}
