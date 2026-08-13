import { NextResponse } from "next/server";
import { checkPostgres } from "@/lib/health/checks";

export async function GET() {
  const result = await checkPostgres();
  return NextResponse.json(result, { status: result.status === "ok" ? 200 : 503 });
}