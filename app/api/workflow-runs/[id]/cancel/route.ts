import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http";
import { cancelWorkflowRun } from "@/lib/workflows/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request.headers);
    const { id } = await context.params;
    return NextResponse.json({ run: await cancelWorkflowRun(user.id, id) });
  } catch (error) {
    return errorResponse(error);
  }
}
