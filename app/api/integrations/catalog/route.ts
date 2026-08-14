import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http";
import { getIntegrationCatalog } from "@/lib/integrations/registry";

export async function GET(request: Request) {
  try {
    await requireUser(request.headers);
    return NextResponse.json({ integrations: getIntegrationCatalog() });
  } catch (error) {
    return errorResponse(error);
  }
}
