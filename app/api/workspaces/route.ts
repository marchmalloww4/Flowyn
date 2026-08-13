import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { createWorkspace, listWorkspaces } from "@/lib/workspaces/service";
import { workspaceInputSchema } from "@/lib/workspaces/validation";

export async function GET(request: Request) {
  try {
    const currentUser = await requireUser(request.headers);
    return NextResponse.json({ workspaces: await listWorkspaces(currentUser.id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireUser(request.headers);
    const input = await readJson(request, workspaceInputSchema);
    return NextResponse.json({ workspace: await createWorkspace(currentUser.id, input) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}