import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { errorResponse, readJson } from "@/lib/http";
import { createIntegrationCredential, listIntegrationCredentials } from "@/lib/integrations/credentials";
import { integrationCredentialCreateSchema, integrationCredentialListQuerySchema } from "@/lib/integrations/validation";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request.headers);
    const input = integrationCredentialListQuerySchema.parse({ workspaceId: new URL(request.url).searchParams.get("workspaceId") });
    return NextResponse.json({ credentials: await listIntegrationCredentials(user.id, input.workspaceId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request.headers);
    const input = await readJson(request, integrationCredentialCreateSchema);
    return NextResponse.json({ credential: await createIntegrationCredential(user.id, input) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
