import { getEmbeddingConfig, type EmbeddingConfig } from "@/lib/embeddings/config";
import { DimensionMismatchError, EmbeddingFailedError, InvalidRequestError, MalformedResponseError, ModelUnavailableError, ProviderUnavailableError, RequestTimeoutError } from "@/lib/embeddings/errors";
import type { EmbeddingProvider } from "@/lib/embeddings/types";

type FetchLike = typeof fetch;

type OllamaTagsResponse = {
  models?: Array<{ name?: string; model?: string }>;
};

type OllamaEmbedResponse = {
  model?: string;
  embeddings?: unknown;
  embedding?: unknown;
};

export interface OllamaEmbeddingProviderOptions {
  baseUrl?: string;
  model?: string;
  dimension?: number;
  timeoutMs?: number;
  fetcher?: FetchLike;
  config?: EmbeddingConfig;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumberVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

// Ollama reports an untagged model as `name:latest`, so both sides are compared with the implied tag.
function withImpliedTag(name: string): string {
  return name.includes(":") ? name : `${name}:latest`;
}

function modelNames(payload: OllamaTagsResponse): string[] {
  return (payload.models ?? []).flatMap((model) => [model.name, model.model]).filter((name): name is string => typeof name === "string").map(withImpliedTag);
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly dimension: number;
  private readonly timeoutMs: number;
  private readonly fetcher: FetchLike;

  constructor(options: OllamaEmbeddingProviderOptions = {}) {
    const config = options.config ?? getEmbeddingConfig();
    this.baseUrl = (options.baseUrl ?? config.baseUrl).replace(/\/$/, "");
    this.model = options.model ?? config.model;
    this.dimension = options.dimension ?? config.dimension;
    this.timeoutMs = options.timeoutMs ?? config.timeoutMs;
    this.fetcher = options.fetcher ?? fetch;
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetcher(`${this.baseUrl}${path}`, { ...init, signal: controller.signal, cache: "no-store" });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new RequestTimeoutError();
      throw new ProviderUnavailableError();
    } finally {
      clearTimeout(timer);
    }
  }

  private async assertModelAvailable(): Promise<void> {
    const response = await this.request("/api/tags");
    if (!response.ok) throw new ProviderUnavailableError();
    let payload: OllamaTagsResponse;
    try {
      payload = await response.json() as OllamaTagsResponse;
    } catch {
      throw new MalformedResponseError();
    }
    if (!isRecord(payload)) throw new MalformedResponseError();
    if (!modelNames(payload).includes(withImpliedTag(this.model))) throw new ModelUnavailableError(this.model);
  }

  private parseVectors(payload: OllamaEmbedResponse, expectedCount: number): number[][] {
    const raw = payload.embeddings ?? payload.embedding;
    const vectors = isNumberVector(raw) ? [raw] : Array.isArray(raw) && raw.every(isNumberVector) ? raw : null;
    if (!vectors || vectors.length !== expectedCount) throw new MalformedResponseError();
    for (const vector of vectors) {
      if (vector.length !== this.dimension) throw new DimensionMismatchError(this.dimension, vector.length);
    }
    return vectors;
  }

  async embedText(text: string): Promise<number[]> {
    const [vector] = await this.embedDocuments([text]);
    if (!vector) throw new MalformedResponseError();
    return vector;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    if (!Array.isArray(texts) || texts.length === 0 || texts.some((text) => typeof text !== "string" || !text.trim())) {
      throw new InvalidRequestError("Embedding input must contain non-empty text.");
    }
    await this.assertModelAvailable();
    const response = await this.request("/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, input: texts.length === 1 ? texts[0] : texts }),
    });
    if (!response.ok) {
      if (response.status === 404) throw new ModelUnavailableError(this.model);
      throw new EmbeddingFailedError();
    }
    let payload: OllamaEmbedResponse;
    try {
      payload = await response.json() as OllamaEmbedResponse;
    } catch {
      throw new MalformedResponseError();
    }
    if (!isRecord(payload)) throw new MalformedResponseError();
    return this.parseVectors(payload, texts.length);
  }
}
