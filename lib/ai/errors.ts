export type AIErrorCode =
  | "PROVIDER_UNAVAILABLE"
  | "MODEL_UNAVAILABLE"
  | "REQUEST_TIMEOUT"
  | "INVALID_REQUEST"
  | "GENERATION_FAILED"
  | "INVALID_STRUCTURED_OUTPUT";

export class AIError extends Error {
  constructor(public readonly code: AIErrorCode, message: string, public readonly status: number) {
    super(message);
    this.name = "AIError";
  }
}

export class AIProviderError extends AIError {
  constructor(code: AIErrorCode, message: string, status = 503) {
    super(code, message, status);
    this.name = "AIProviderError";
  }
}

export class ProviderUnavailableError extends AIProviderError {
  constructor() {
    super("PROVIDER_UNAVAILABLE", "The configured AI provider is unavailable.", 503);
    this.name = "ProviderUnavailableError";
  }
}

export class ModelUnavailableError extends AIProviderError {
  constructor() {
    super("MODEL_UNAVAILABLE", "The configured AI model is unavailable.", 503);
    this.name = "ModelUnavailableError";
  }
}

export class RequestTimeoutError extends AIProviderError {
  constructor() {
    super("REQUEST_TIMEOUT", "The AI request timed out.", 504);
    this.name = "RequestTimeoutError";
  }
}

export class InvalidRequestError extends AIError {
  constructor(message = "The AI request is invalid.") {
    super("INVALID_REQUEST", message, 400);
    this.name = "InvalidRequestError";
  }
}

export class GenerationFailedError extends AIProviderError {
  constructor() {
    super("GENERATION_FAILED", "The AI provider could not complete the request.", 502);
    this.name = "GenerationFailedError";
  }
}

export class InvalidStructuredOutputError extends AIProviderError {
  constructor() {
    super("INVALID_STRUCTURED_OUTPUT", "The AI provider returned invalid structured output.", 502);
    this.name = "InvalidStructuredOutputError";
  }
}
