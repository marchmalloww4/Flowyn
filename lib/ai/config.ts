import { getEnv } from "@/lib/env";

export interface AIConfig {
  provider: "ollama";
  baseUrl: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  maxPromptChars: number;
}

export function getAIConfig(): AIConfig {
  const env = getEnv();
  return Object.freeze({
    provider: env.AI_PROVIDER,
    baseUrl: env.OLLAMA_BASE_URL.replace(/\/$/, ""),
    model: env.OLLAMA_MODEL,
    temperature: env.AI_TEMPERATURE,
    maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
    timeoutMs: env.AI_REQUEST_TIMEOUT_MS,
    maxPromptChars: env.MAX_GENERATION_PROMPT_CHARS,
  });
}
