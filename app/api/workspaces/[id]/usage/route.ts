import { requireUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http";
import { getWorkspaceUsageSummary } from "@/lib/workspaces/operations";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request.headers);
    const { id } = await context.params;
    return NextResponse.json(await getWorkspaceUsageSummary(user.id, id));
  } catch (error) {
    return errorResponse(error);
  }
}
