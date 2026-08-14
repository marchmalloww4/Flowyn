import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { errorResponse, readJson } from "@/lib/http";
import { createWorkflowSchedule, listWorkflowSchedules } from "@/lib/schedules/service";
import { workflowScheduleCreateSchema, workflowScheduleListQuerySchema } from "@/lib/schedules/http-schemas";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request.headers);
    const input = workflowScheduleListQuerySchema.parse({ workspaceId: new URL(request.url).searchParams.get("workspaceId") });
    return NextResponse.json({ schedules: await listWorkflowSchedules(user.id, input.workspaceId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request.headers);
    const input = await readJson(request, workflowScheduleCreateSchema);
    return NextResponse.json({ schedule: await createWorkflowSchedule(user.id, input) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
