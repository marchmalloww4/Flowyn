import type { ZodType } from "zod";

export interface LLMGenerateInput {
  prompt: string;
  system?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  format?: "json";
}

export interface LLMResult {
  text: string;
  model: string;
  done: boolean;
  durationMs: number;
}

export interface LLMHealthResult {
  ready: boolean;
  model: string;
  errorCode?: "UNAVAILABLE" | "MODEL_MISSING" | "HTTP_ERROR" | "TIMEOUT";
}

export interface LLMStructuredInput<T> extends Omit<LLMGenerateInput, "format"> {
  schema: ZodType<T>;
}

export interface LLMStructuredResult<T> extends LLMResult {
  value: T;
}

export interface LLMStreamChunk {
  text: string;
  model: string;
  done: boolean;
}

export interface LLMProvider {
  generate(input: LLMGenerateInput): Promise<LLMResult>;
  generateStructured<T>(input: LLMStructuredInput<T>): Promise<LLMStructuredResult<T>>;
  stream(input: LLMGenerateInput): AsyncIterable<LLMStreamChunk>;
  health(): Promise<LLMHealthResult>;
}

export type AIProvider = LLMProvider;
export { AIProviderError } from "@/lib/ai/errors";
