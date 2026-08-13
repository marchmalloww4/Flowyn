import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { createBrand, listBrands } from "@/lib/brands/service";
import { brandInputSchema } from "@/lib/brands/validation";

export async function GET(request: Request) {
  try {
    const currentUser = await requireUser(request.headers);
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "workspaceId is required." } }, { status: 400 });
    return NextResponse.json({ brands: await listBrands(currentUser.id, workspaceId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireUser(request.headers);
    const input = await readJson(request, brandInputSchema);
    return NextResponse.json({ brand: await createBrand(currentUser.id, input) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}