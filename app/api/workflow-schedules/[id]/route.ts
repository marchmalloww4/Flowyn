import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { errorResponse, readJson } from "@/lib/http";
import { deleteWorkflowSchedule, getWorkflowSchedule, updateWorkflowSchedule } from "@/lib/schedules/service";
import { workflowSchedulePatchSchema } from "@/lib/schedules/http-schemas";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request.headers);
    const { id } = await context.params;
    return NextResponse.json({ schedule: await getWorkflowSchedule(user.id, id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request.headers);
    const { id } = await context.params;
    const input = await readJson(request, workflowSchedulePatchSchema);
    return NextResponse.json({ schedule: await updateWorkflowSchedule(user.id, id, input) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request.headers);
    const { id } = await context.params;
    await deleteWorkflowSchedule(user.id, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
