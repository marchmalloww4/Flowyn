import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http";
import { listWorkflowScheduleOccurrences } from "@/lib/schedules/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request.headers);
    const { id } = await context.params;
    return NextResponse.json({ occurrences: await listWorkflowScheduleOccurrences(user.id, id) });
  } catch (error) {
    return errorResponse(error);
  }
}
