import { getAIConfig, type AIConfig } from "@/lib/ai/config";
import { AIError, GenerationFailedError, InvalidRequestError } from "@/lib/ai/errors";
import { recordGenerationLog } from "@/lib/ai/generation-log";
import { OllamaProvider } from "@/lib/ai/ollama-provider";
import { buildPrompt } from "@/lib/ai/prompt";
import type { LLMGenerateInput, LLMProvider, LLMResult, LLMStreamChunk } from "@/lib/ai/types";
import { getBrand } from "@/lib/brands/service";
import { getDatabase, type Database } from "@/lib/database";
import { requireWorkspaceMember } from "@/lib/authz/authorization";
import { AppError } from "@/lib/security/errors";

export interface GenerationRequest {
  userId: string;
  workspaceId: string;
  brandId?: string;
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface PreparedGeneration {
  provider: LLMProvider;
  providerInput: LLMGenerateInput;
  config: AIConfig;
  workspaceId: string;
  userId: string;
  inputChars: number;
}

export function getAIProvider(): LLMProvider {
  const config = getAIConfig();
  if (config.provider === "ollama") return new OllamaProvider({ config });
  throw new AppError("AI_PROVIDER_UNSUPPORTED", 500, "The configured AI provider is unsupported.");
}

export const getLLMProvider = getAIProvider;

export async function prepareGeneration(input: GenerationRequest, provider: LLMProvider = getAIProvider(), db: Database = getDatabase()): Promise<PreparedGeneration> {
  await requireWorkspaceMember(input.userId, input.workspaceId, db);
  const config = getAIConfig();
  let brandContext;
  if (input.brandId) {
    const brand = await getBrand(input.userId, input.brandId, db);
    if (brand.workspaceId !== input.workspaceId) throw new AppError("RESOURCE_NOT_FOUND", 404, "Resource not found.");
    brandContext = brand;
  }
  const built = buildPrompt({
    systemInstructions: input.system,
    userInstructions: input.prompt,
    brandContext,
  });
  if (built.totalChars > config.maxPromptChars) throw new InvalidRequestError("The prompt exceeds the configured local limit.");
  return {
    provider,
    providerInput: {
      prompt: built.prompt,
      system: built.system || undefined,
      temperature: input.temperature ?? config.temperature,
      maxTokens: input.maxTokens ?? config.maxOutputTokens,
    },
    config,
    workspaceId: input.workspaceId,
    userId: input.userId,
    inputChars: built.totalChars,
  };
}

function normalizeError(error: unknown): AIError {
  if (error instanceof AIError) return error;
  return new GenerationFailedError();
}

async function safeRecordGenerationLog(input: Parameters<typeof recordGenerationLog>[0], db: Database): Promise<void> {
  try {
    await recordGenerationLog(input, db);
  } catch (error) {
    console.error("Generation log persistence failed", error instanceof Error ? error.message : "unknown error");
  }
}

export async function generateText(prepared: PreparedGeneration, db: Database = getDatabase()): Promise<LLMResult> {
  const startedAt = performance.now();
  try {
    const result = await prepared.provider.generate(prepared.providerInput);
    await safeRecordGenerationLog({ workspaceId: prepared.workspaceId, userId: prepared.userId, provider: prepared.config.provider, model: result.model, status: "SUCCEEDED", durationMs: Math.max(0, Math.round(performance.now() - startedAt)), inputChars: prepared.inputChars, outputChars: result.text.length }, db);
    return result;
  } catch (error) {
    const normalized = normalizeError(error);
    await safeRecordGenerationLog({ workspaceId: prepared.workspaceId, userId: prepared.userId, provider: prepared.config.provider, model: prepared.config.model, status: "FAILED", durationMs: Math.max(0, Math.round(performance.now() - startedAt)), inputChars: prepared.inputChars, errorCode: normalized.code }, db);
    throw normalized;
  }
}

export async function* streamText(prepared: PreparedGeneration, db: Database = getDatabase()): AsyncIterable<LLMStreamChunk> {
  const startedAt = performance.now();
  let outputChars = 0;
  let model = prepared.config.model;
  try {
    for await (const chunk of prepared.provider.stream(prepared.providerInput)) {
      model = chunk.model;
      outputChars += chunk.text.length;
      yield chunk;
    }
    await safeRecordGenerationLog({ workspaceId: prepared.workspaceId, userId: prepared.userId, provider: prepared.config.provider, model, status: "SUCCEEDED", durationMs: Math.max(0, Math.round(performance.now() - startedAt)), inputChars: prepared.inputChars, outputChars }, db);
  } catch (error) {
    const normalized = normalizeError(error);
    await safeRecordGenerationLog({ workspaceId: prepared.workspaceId, userId: prepared.userId, provider: prepared.config.provider, model, status: "FAILED", durationMs: Math.max(0, Math.round(performance.now() - startedAt)), inputChars: prepared.inputChars, outputChars, errorCode: normalized.code }, db);
    throw normalized;
  }
}
