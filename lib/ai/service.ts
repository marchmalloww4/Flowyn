import { getEnv } from "@/lib/env";
import { OllamaProvider } from "@/lib/ai/ollama-provider";
import type { LLMGenerateInput, LLMProvider } from "@/lib/ai/types";

export function getLLMProvider(): LLMProvider {
  return new OllamaProvider();
}

export async function generateText(input: LLMGenerateInput, provider: LLMProvider = getLLMProvider()) {
  if (input.prompt.length > getEnv().MAX_GENERATION_PROMPT_CHARS) {
    throw new Error("PROMPT_TOO_LARGE");
  }
  return provider.generate(input);
}