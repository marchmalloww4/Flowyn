export interface LLMGenerateInput {
  prompt: string;
  system?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
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

export interface LLMProvider {
  generate(input: LLMGenerateInput): Promise<LLMResult>;
  health(): Promise<LLMHealthResult>;
}

export class AIProviderError extends Error {
  constructor(public readonly code: "UNAVAILABLE" | "MODEL_MISSING" | "HTTP_ERROR" | "TIMEOUT", message: string, public readonly status = 503) {
    super(message);
    this.name = "AIProviderError";
  }
}