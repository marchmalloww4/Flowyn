import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { getBrand, updateBrand } from "@/lib/brands/service";
import { brandPatchSchema } from "@/lib/brands/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const currentUser = await requireUser(request.headers);
    const { id } = await context.params;
    return NextResponse.json({ brand: await getBrand(currentUser.id, id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const currentUser = await requireUser(request.headers);
    const { id } = await context.params;
    const input = await readJson(request, brandPatchSchema);
    return NextResponse.json({ brand: await updateBrand(currentUser.id, id, input) });
  } catch (error) {
    return errorResponse(error);
  }
}