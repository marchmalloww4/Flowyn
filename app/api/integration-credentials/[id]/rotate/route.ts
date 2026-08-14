import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { errorResponse, readJson } from "@/lib/http";
import { rotateIntegrationCredential } from "@/lib/integrations/credentials";
import { integrationCredentialRotateSchema } from "@/lib/integrations/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request.headers);
    const { id } = await context.params;
    const input = await readJson(request, integrationCredentialRotateSchema);
    return NextResponse.json({ credential: await rotateIntegrationCredential(user.id, id, input) });
  } catch (error) {
    return errorResponse(error);
  }
}
