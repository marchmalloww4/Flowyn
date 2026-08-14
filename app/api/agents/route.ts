import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { createAgent, listAgents } from "@/lib/agents/service";
import { agentCreateSchema, agentListQuerySchema } from "@/lib/agents/validation";
import { errorResponse, readJson } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const currentUser = await requireUser(request.headers);
    const input = agentListQuerySchema.parse({ workspaceId: new URL(request.url).searchParams.get("workspaceId") });
    return NextResponse.json({ agents: await listAgents(currentUser.id, input.workspaceId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireUser(request.headers);
    const input = await readJson(request, agentCreateSchema);
    return NextResponse.json({ agent: await createAgent(currentUser.id, input) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
