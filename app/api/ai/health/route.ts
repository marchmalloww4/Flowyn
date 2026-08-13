import { NextResponse } from "next/server";
import { getAIProvider } from "@/lib/ai/service";

export async function GET() {
  const result = await getAIProvider().health();
  return NextResponse.json({ service: "ollama", ...result }, { status: result.ready ? 200 : 503 });
}
