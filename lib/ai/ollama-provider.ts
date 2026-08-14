import { getAIConfig, type AIConfig } from "@/lib/ai/config";
import { GenerationFailedError, InvalidRequestError, InvalidStructuredOutputError, ModelUnavailableError, ProviderUnavailableError, RequestTimeoutError } from "@/lib/ai/errors";
import type { LLMGenerateInput, LLMHealthResult, LLMProvider, LLMResult, LLMStreamChunk, LLMStructuredInput, LLMStructuredResult } from "@/lib/ai/types";

type FetchLike = typeof fetch;
type OllamaTagsResponse = { models?: Array<{ name?: string; model?: string }> };
type OllamaGenerateResponse = { response?: string; model?: string; done?: boolean; error?: string };

export interface OllamaProviderOptions {
  baseUrl?: string;
  defaultModel?: string;
  timeoutMs?: number;
  fetcher?: FetchLike;
  config?: AIConfig;
}

function modelNames(payload: OllamaTagsResponse): string[] {
  return (payload.models ?? []).flatMap((model) => [model.name, model.model]).filter((name): name is string => Boolean(name));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class OllamaProvider implements LLMProvider {
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly timeoutMs: number;
  private readonly fetcher: FetchLike;

  constructor(options: OllamaProviderOptions = {}) {
    const config = options.config ?? getAIConfig();
    this.baseUrl = (options.baseUrl ?? config.baseUrl).replace(/\/$/, "");
    this.defaultModel = options.defaultModel ?? config.model;
    this.timeoutMs = options.timeoutMs ?? config.timeoutMs;
    this.fetcher = options.fetcher ?? fetch;
  }

  private createRequestController(signal?: AbortSignal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    return {
      controller,
      cleanup: () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      },
    };
  }

  private async request(path: string, init?: RequestInit, signal?: AbortSignal): Promise<Response> {
    const request = this.createRequestController(signal);
    try {
      return await this.fetcher(`${this.baseUrl}${path}`, { ...init, signal: request.controller.signal, cache: "no-store" });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new RequestTimeoutError();
      throw new ProviderUnavailableError();
    } finally {
      request.cleanup();
    }
  }

  private async assertModelAvailable(model: string, signal?: AbortSignal): Promise<void> {
    const response = await this.request("/api/tags", undefined, signal);
    if (!response.ok) throw new ProviderUnavailableError();
    let payload: OllamaTagsResponse;
    try {
      payload = await response.json() as OllamaTagsResponse;
    } catch {
      throw new ProviderUnavailableError();
    }
    if (!modelNames(payload).includes(model)) throw new ModelUnavailableError();
  }

  async health(): Promise<LLMHealthResult> {
    try {
      await this.assertModelAvailable(this.defaultModel);
      return { ready: true, model: this.defaultModel };
    } catch (error) {
      if (error instanceof ModelUnavailableError) return { ready: false, model: this.defaultModel, errorCode: "MODEL_MISSING" };
      if (error instanceof RequestTimeoutError) return { ready: false, model: this.defaultModel, errorCode: "TIMEOUT" };
      if (error instanceof ProviderUnavailableError) return { ready: false, model: this.defaultModel, errorCode: "UNAVAILABLE" };
      return { ready: false, model: this.defaultModel, errorCode: "HTTP_ERROR" };
    }
  }

  async generate(input: LLMGenerateInput): Promise<LLMResult> {
    if (!input.prompt.trim()) throw new InvalidRequestError("The prompt cannot be empty.");
    const model = input.model ?? this.defaultModel;
    await this.assertModelAvailable(model, input.signal);
    const startedAt = performance.now();
    const body: Record<string, unknown> = {
      model,
      prompt: input.prompt,
      stream: false,
      options: { temperature: input.temperature ?? getAIConfig().temperature, num_predict: input.maxTokens ?? getAIConfig().maxOutputTokens },
    };
    if (input.system) body.system = input.system;
    if (input.format) body.format = input.format;
    const response = await this.request("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, input.signal);
    let payload: OllamaGenerateResponse | null = null;
    try {
      payload = await response.json() as OllamaGenerateResponse;
    } catch {
      if (response.ok) throw new GenerationFailedError();
    }
    if (!response.ok) {
      if (response.status === 404) throw new ModelUnavailableError();
      throw new GenerationFailedError();
    }
    if (!payload || typeof payload.response !== "string" || !payload.response.trim()) throw new GenerationFailedError();
    return { text: payload.response, model: payload.model ?? model, done: payload.done ?? true, durationMs: Math.max(0, Math.round(performance.now() - startedAt)) };
  }

  async generateStructured<T>(input: LLMStructuredInput<T>): Promise<LLMStructuredResult<T>> {
    const result = await this.generate({ ...input, format: input.format ?? "json" });
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.text) as unknown;
    } catch {
      throw new InvalidStructuredOutputError();
    }
    const validated = input.schema.safeParse(parsed);
    if (!validated.success) throw new InvalidStructuredOutputError();
    return { ...result, value: validated.data };
  }

  async *stream(input: LLMGenerateInput): AsyncIterable<LLMStreamChunk> {
    if (!input.prompt.trim()) throw new InvalidRequestError("The prompt cannot be empty.");
    const model = input.model ?? this.defaultModel;
    await this.assertModelAvailable(model, input.signal);
    const request = this.createRequestController(input.signal);
    try {
      const body: Record<string, unknown> = {
        model,
        prompt: input.prompt,
        stream: true,
        options: { temperature: input.temperature ?? getAIConfig().temperature, num_predict: input.maxTokens ?? getAIConfig().maxOutputTokens },
      };
      if (input.system) body.system = input.system;
      if (input.format) body.format = input.format;
      const response = await this.fetcher(`${this.baseUrl}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: request.controller.signal, cache: "no-store" });
      if (!response.ok) {
        if (response.status === 404) throw new ModelUnavailableError();
        throw new GenerationFailedError();
      }
      if (!response.body) throw new GenerationFailedError();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let yielded = false;
      let finished = false;
      while (!finished) {
        const next = await reader.read();
        buffer += decoder.decode(next.value ?? new Uint8Array(), { stream: !next.done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const chunk = this.parseStreamChunk(trimmed, model);
          yielded = true;
          yield chunk;
          if (chunk.done) {
            finished = true;
            break;
          }
        }
        if (next.done) finished = true;
      }
      const trailing = buffer.trim();
      if (trailing) {
        yielded = true;
        yield this.parseStreamChunk(trailing, model);
      }
      if (!yielded) throw new GenerationFailedError();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new RequestTimeoutError();
      if (error instanceof ProviderUnavailableError || error instanceof ModelUnavailableError || error instanceof RequestTimeoutError || error instanceof GenerationFailedError || error instanceof InvalidRequestError) throw error;
      throw new ProviderUnavailableError();
    } finally {
      request.cleanup();
    }
  }

  private parseStreamChunk(line: string, fallbackModel: string): LLMStreamChunk {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      throw new GenerationFailedError();
    }
    if (!isRecord(parsed) || typeof parsed.response !== "string" || (parsed.done !== undefined && typeof parsed.done !== "boolean")) throw new GenerationFailedError();
    return { text: parsed.response, model: typeof parsed.model === "string" ? parsed.model : fallbackModel, done: parsed.done === true };
  }
}
