import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { errorResponse, readJson } from "@/lib/http";
import { generateText } from "@/lib/ai/service";
import { AIProviderError } from "@/lib/ai/types";
import { getEnv } from "@/lib/env";

const generateSchema = z.object({
  prompt: z.string().trim().min(1).max(getEnv().MAX_GENERATION_PROMPT_CHARS),
  system: z.string().trim().max(4000).optional(),
  model: z.string().trim().min(1).max(120).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(4000).optional(),
});

export async function POST(request: Request) {
  try {
    await requireUser(request.headers);
    const input = await readJson(request, generateSchema);
    return NextResponse.json({ result: await generateText(input) });
  } catch (error) {
    if (error instanceof AIProviderError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    if (error instanceof Error && error.message === "PROMPT_TOO_LARGE") {
      return NextResponse.json({ error: { code: "PROMPT_TOO_LARGE", message: "The prompt exceeds the configured local limit." } }, { status: 400 });
    }
    return errorResponse(error);
  }
}