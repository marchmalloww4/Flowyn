import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { changeMemberRole, removeMember } from "@/lib/memberships/service";
import { workspaceRoleSchema } from "@/lib/memberships/validation";

type RouteContext = { params: Promise<{ id: string; userId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const currentUser = await requireUser(request.headers);
    const { id, userId } = await context.params;
    const input = await readJson(request, workspaceRoleSchema);
    return NextResponse.json({ member: await changeMemberRole(currentUser.id, id, userId, input.role) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const currentUser = await requireUser(request.headers);
    const { id, userId } = await context.params;
    await removeMember(currentUser.id, id, userId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
