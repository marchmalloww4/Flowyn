import { NextResponse } from "next/server";
import { getLLMProvider } from "@/lib/ai/service";

export async function GET() {
  const result = await getLLMProvider().health();
  return NextResponse.json({ service: "ollama", ...result }, { status: result.ready ? 200 : 503 });
}