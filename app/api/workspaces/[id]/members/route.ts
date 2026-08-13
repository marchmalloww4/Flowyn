import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { addMember, listMembers } from "@/lib/memberships/service";
import { addMemberSchema } from "@/lib/memberships/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const currentUser = await requireUser(request.headers);
    const { id } = await context.params;
    return NextResponse.json({ members: await listMembers(currentUser.id, id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const currentUser = await requireUser(request.headers);
    const { id } = await context.params;
    const input = await readJson(request, addMemberSchema);
    return NextResponse.json({ member: await addMember(currentUser.id, id, input) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
