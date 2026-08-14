import { NextResponse } from "next/server";
import { getReadiness } from "@/lib/health/readiness";

export async function GET() {
  const readiness = await getReadiness();
  return NextResponse.json(readiness, { status: readiness.status === "not_ready" ? 503 : 200 });
}
