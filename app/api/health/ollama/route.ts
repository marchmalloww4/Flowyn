import { NextResponse } from "next/server";
import { checkOllama } from "@/lib/health/checks";

export async function GET() {
  const result = await checkOllama();
  return NextResponse.json(result, { status: result.status === "ok" ? 200 : 503 });
}