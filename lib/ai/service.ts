import { getAIConfig, type AIConfig } from "@/lib/ai/config";
import { AIError, GenerationFailedError, InvalidRequestError } from "@/lib/ai/errors";
import { recordGenerationLog } from "@/lib/ai/generation-log";
import { OllamaProvider } from "@/lib/ai/ollama-provider";
import { buildPrompt } from "@/lib/ai/prompt";
import type { LLMGenerateInput, LLMProvider, LLMResult, LLMStreamChunk } from "@/lib/ai/types";
import { getBrand, getBrandForWorkspace } from "@/lib/brands/service";
import { getDatabase, type Database } from "@/lib/database";
import { requireWorkspaceMember } from "@/lib/authz/authorization";
import { getBrandContext, getBrandContextForPrincipal } from "@/lib/knowledge/brand-context";
import { AppError } from "@/lib/security/errors";
import { userExecutionPrincipal, type ExecutionPrincipal } from "@/lib/security/principal";
import { admitAiGeneration } from "@/lib/usage/service";

export interface GenerationUsageAdmission {
  operationKey: string;
  sourceType: string;
  sourceId?: string | null;
  correlationId?: string | null;
}

export interface GenerationRequest {
  userId?: string;
  workspaceId: string;
  principal?: ExecutionPrincipal;
  brandId?: string;
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  useBrandContext?: boolean;
  abortSignal?: AbortSignal;
  usage?: GenerationUsageAdmission;
}

export interface PreparedGeneration {
  provider: LLMProvider;
  providerInput: LLMGenerateInput;
  config: AIConfig;
  workspaceId: string;
  userId: string | null;
  principal: ExecutionPrincipal;
  inputChars: number;
  usage?: GenerationUsageAdmission;
  skipUsageAdmission?: boolean;
}

function resolvePrincipal(input: GenerationRequest): ExecutionPrincipal {
  const principal = input.principal ?? (input.userId ? userExecutionPrincipal(input.userId) : undefined);
  if (!principal) throw new AppError("AI_PRINCIPAL_REQUIRED", 500, "AI execution requires a verified execution principal.");
  if (principal.kind === "workspace_automation" && principal.workspaceId !== input.workspaceId) {
    throw new AppError("RESOURCE_NOT_FOUND", 404, "Resource not found.");
  }
  if (principal.kind === "user" && input.userId && principal.userId !== input.userId) {
    throw new AppError("AI_PRINCIPAL_INVALID", 500, "The AI execution principal does not match the user context.");
  }
  return principal;
}

export function getAIProvider(): LLMProvider {
  const config = getAIConfig();
  if (config.provider === "ollama") return new OllamaProvider({ config });
  throw new AppError("AI_PROVIDER_UNSUPPORTED", 500, "The configured AI provider is unsupported.");
}

export const getLLMProvider = getAIProvider;

export async function prepareGeneration(input: GenerationRequest, provider: LLMProvider = getAIProvider(), db: Database = getDatabase()): Promise<PreparedGeneration> {
  const principal = resolvePrincipal(input);
  const principalUserId = principal.kind === "user" ? principal.userId : null;
  if (principalUserId) await requireWorkspaceMember(principalUserId, input.workspaceId, db);
  const config = getAIConfig();
  let brandContext;
  if (input.useBrandContext && !input.brandId) throw new InvalidRequestError("A brand is required when brand context is enabled.");
  if (input.brandId) {
    const brand = principal.kind === "workspace_automation"
      ? await getBrandForWorkspace(input.workspaceId, input.brandId, db)
      : await getBrand(principal.userId, input.brandId, db);
    if (brand.workspaceId !== input.workspaceId) throw new AppError("RESOURCE_NOT_FOUND", 404, "Resource not found.");
    brandContext = brand;
  }
  if (input.useBrandContext && input.brandId) {
    const hybridContext = principal.kind === "workspace_automation"
      ? await getBrandContextForPrincipal({ principal, workspaceId: input.workspaceId, brandId: input.brandId, query: input.prompt, includeKnowledge: true }, db)
      : await getBrandContext({ userId: principal.userId, brandId: input.brandId, query: input.prompt, includeKnowledge: true }, db);
    brandContext = { ...hybridContext.brand, retrievedKnowledge: hybridContext.knowledge };
  }
  const built = buildPrompt({
    systemInstructions: input.system,
    userInstructions: input.prompt,
    brandContext,
    ragEnabled: input.useBrandContext === true,
  });
  if (built.totalChars > config.maxPromptChars) throw new InvalidRequestError("The prompt exceeds the configured local limit.");
  return {
    provider,
    providerInput: {
      prompt: built.prompt,
      system: built.system || undefined,
      temperature: input.temperature ?? config.temperature,
      maxTokens: input.maxTokens ?? config.maxOutputTokens,
      signal: input.abortSignal,
    },
    config,
    workspaceId: input.workspaceId,
    userId: principalUserId,
    principal,
    inputChars: built.totalChars,
    usage: input.usage,
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
    if (prepared.usage && !prepared.skipUsageAdmission) await admitAiGeneration({ workspaceId: prepared.workspaceId, ...prepared.usage, db });
    const result = await prepared.provider.generate(prepared.providerInput);
    await safeRecordGenerationLog({ workspaceId: prepared.workspaceId, userId: prepared.userId, provider: prepared.config.provider, model: result.model, status: "SUCCEEDED", durationMs: Math.max(0, Math.round(performance.now() - startedAt)), inputChars: prepared.inputChars, outputChars: result.text.length, correlationId: prepared.usage?.correlationId }, db);
    return result;
  } catch (error) {
    const normalized = normalizeError(error);
    await safeRecordGenerationLog({ workspaceId: prepared.workspaceId, userId: prepared.userId, provider: prepared.config.provider, model: prepared.config.model, status: "FAILED", durationMs: Math.max(0, Math.round(performance.now() - startedAt)), inputChars: prepared.inputChars, errorCode: normalized.code, correlationId: prepared.usage?.correlationId }, db);
    throw normalized;
  }
}

export async function* streamText(prepared: PreparedGeneration, db: Database = getDatabase()): AsyncIterable<LLMStreamChunk> {
  const startedAt = performance.now();
  let outputChars = 0;
  let model = prepared.config.model;
  try {
    if (prepared.usage && !prepared.skipUsageAdmission) await admitAiGeneration({ workspaceId: prepared.workspaceId, ...prepared.usage, db });
    for await (const chunk of prepared.provider.stream(prepared.providerInput)) {
      model = chunk.model;
      outputChars += chunk.text.length;
      yield chunk;
    }
    await safeRecordGenerationLog({ workspaceId: prepared.workspaceId, userId: prepared.userId, provider: prepared.config.provider, model, status: "SUCCEEDED", durationMs: Math.max(0, Math.round(performance.now() - startedAt)), inputChars: prepared.inputChars, outputChars, correlationId: prepared.usage?.correlationId }, db);
  } catch (error) {
    const normalized = normalizeError(error);
    await safeRecordGenerationLog({ workspaceId: prepared.workspaceId, userId: prepared.userId, provider: prepared.config.provider, model, status: "FAILED", durationMs: Math.max(0, Math.round(performance.now() - startedAt)), inputChars: prepared.inputChars, outputChars, errorCode: normalized.code, correlationId: prepared.usage?.correlationId }, db);
    throw normalized;
  }
}
