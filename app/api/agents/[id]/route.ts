import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { deleteAgent, getAgent, updateAgent } from "@/lib/agents/service";
import { agentPatchSchema } from "@/lib/agents/validation";
import { errorResponse, readJson } from "@/lib/http";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const currentUser = await requireUser(request.headers);
    const { id } = await context.params;
    return NextResponse.json({ agent: await getAgent(currentUser.id, id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const currentUser = await requireUser(request.headers);
    const { id } = await context.params;
    const input = await readJson(request, agentPatchSchema);
    return NextResponse.json({ agent: await updateAgent(currentUser.id, id, input) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const currentUser = await requireUser(request.headers);
    const { id } = await context.params;
    await deleteAgent(currentUser.id, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
