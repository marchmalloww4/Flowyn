import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { errorResponse, readJson } from "@/lib/http";
import { getIntegrationCredential, revokeIntegrationCredential, updateIntegrationCredential } from "@/lib/integrations/credentials";
import { integrationCredentialPatchSchema } from "@/lib/integrations/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request.headers);
    const { id } = await context.params;
    return NextResponse.json({ credential: await getIntegrationCredential(user.id, id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request.headers);
    const { id } = await context.params;
    const input = await readJson(request, integrationCredentialPatchSchema);
    return NextResponse.json({ credential: await updateIntegrationCredential(user.id, id, input) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request.headers);
    const { id } = await context.params;
    await revokeIntegrationCredential(user.id, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
