import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { getAgentRun } from "@/lib/agents/service";
import { errorResponse } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const currentUser = await requireUser(request.headers);
    const { id } = await context.params;
    return NextResponse.json(await getAgentRun(currentUser.id, id));
  } catch (error) {
    return errorResponse(error);
  }
}
