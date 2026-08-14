import { z } from "zod";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { errorResponse } from "@/lib/http";
import { getWorkspaceOperationsSummary } from "@/lib/workspaces/operations";

const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request.headers);
    const { id } = await context.params;
    const parsed = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    if (parsed.from && parsed.to && parsed.from > parsed.to) return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "The operation window is invalid." } }, { status: 400 });
    return NextResponse.json(await getWorkspaceOperationsSummary(user.id, id, parsed));
  } catch (error) {
    return errorResponse(error);
  }
}
