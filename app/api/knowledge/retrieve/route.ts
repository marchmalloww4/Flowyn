import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { errorResponse, readJson } from "@/lib/http";
import { retrieveKnowledge } from "@/lib/knowledge/retrieval";
import { knowledgeRetrieveSchema } from "@/lib/knowledge/validation";

export async function POST(request: Request) {
  try {
    const currentUser = await requireUser(request.headers);
    const input = await readJson(request, knowledgeRetrieveSchema);
    return NextResponse.json({ results: await retrieveKnowledge({ ...input, userId: currentUser.id }) });
  } catch (error) {
    return errorResponse(error);
  }
}
