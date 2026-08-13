import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { deleteWorkspace, getWorkspace, updateWorkspace } from "@/lib/workspaces/service";
import { workspacePatchSchema } from "@/lib/workspaces/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const currentUser = await requireUser(request.headers);
    const { id } = await context.params;
    return NextResponse.json({ workspace: await getWorkspace(currentUser.id, id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const currentUser = await requireUser(request.headers);
    const { id } = await context.params;
    const input = await readJson(request, workspacePatchSchema);
    return NextResponse.json({ workspace: await updateWorkspace(currentUser.id, id, input) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const currentUser = await requireUser(request.headers);
    const { id } = await context.params;
    await deleteWorkspace(currentUser.id, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
