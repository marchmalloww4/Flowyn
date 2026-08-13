import { getEnv } from "@/lib/env";
import { evaluateOllamaModels } from "@/lib/health/checks";
import { AIProviderError, type LLMGenerateInput, type LLMHealthResult, type LLMProvider, type LLMResult } from "@/lib/ai/types";

type FetchLike = typeof fetch;
type OllamaTagsResponse = { models?: Array<{ name?: string; model?: string }> };
type OllamaGenerateResponse = { response?: string; model?: string; done?: boolean; error?: string };

export interface OllamaProviderOptions {
  baseUrl?: string;
  defaultModel?: string;
  timeoutMs?: number;
  fetcher?: FetchLike;
}

export class OllamaProvider implements LLMProvider {
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly timeoutMs: number;
  private readonly fetcher: FetchLike;

  constructor(options: OllamaProviderOptions = {}) {
    const env = getEnv();
    this.baseUrl = (options.baseUrl ?? env.OLLAMA_BASE_URL).replace(/\/$/, "");
    this.defaultModel = options.defaultModel ?? env.OLLAMA_MODEL;
    this.timeoutMs = options.timeoutMs ?? env.AI_REQUEST_TIMEOUT_MS;
    this.fetcher = options.fetcher ?? fetch;
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetcher(`${this.baseUrl}${path}`, { ...init, signal: controller.signal, cache: "no-store" });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new AIProviderError("TIMEOUT", "The local AI provider timed out.");
      throw new AIProviderError("UNAVAILABLE", "The local AI provider is unavailable.");
    } finally {
      clearTimeout(timer);
    }
  }

  async health(): Promise<LLMHealthResult> {
    try {
      const response = await this.request("/api/tags");
      if (!response.ok) return { ready: false, model: this.defaultModel, errorCode: "HTTP_ERROR" };
      const payload = await response.json() as OllamaTagsResponse;
      const models = (payload.models ?? []).flatMap((model) => [model.name, model.model]).filter((name): name is string => Boolean(name));
      try {
        evaluateOllamaModels(models, this.defaultModel);
      } catch {
        return { ready: false, model: this.defaultModel, errorCode: "MODEL_MISSING" };
      }
      return { ready: true, model: this.defaultModel };
    } catch (error) {
      const providerError = error instanceof AIProviderError ? error : new AIProviderError("UNAVAILABLE", "The local AI provider is unavailable.");
      return { ready: false, model: this.defaultModel, errorCode: providerError.code };
    }
  }

  async generate(input: LLMGenerateInput): Promise<LLMResult> {
    const model = input.model ?? this.defaultModel;
    const startedAt = performance.now();
    const response = await this.request("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, prompt: input.prompt, system: input.system, stream: false, options: { temperature: input.temperature ?? 0.4, num_predict: input.maxTokens ?? 800 } }) });
    const payload = await response.json().catch(() => null) as OllamaGenerateResponse | null;
    if (!response.ok) throw new AIProviderError(response.status === 404 ? "MODEL_MISSING" : "HTTP_ERROR", response.status === 404 ? "The configured Ollama model is not installed." : "The local AI provider rejected the request.");
    if (!payload?.response) throw new AIProviderError("HTTP_ERROR", payload?.error ? "The local AI provider returned an invalid response." : "The local AI provider returned no text.");
    return { text: payload.response, model: payload.model ?? model, done: payload.done ?? true, durationMs: Math.max(0, Math.round(performance.now() - startedAt)) };
  }
}