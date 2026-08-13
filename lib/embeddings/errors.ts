export type EmbeddingErrorCode =
  | "PROVIDER_UNAVAILABLE"
  | "MODEL_UNAVAILABLE"
  | "REQUEST_TIMEOUT"
  | "INVALID_REQUEST"
  | "MALFORMED_RESPONSE"
  | "DIMENSION_MISMATCH"
  | "EMBEDDING_FAILED";

export class EmbeddingError extends Error {
  readonly code: EmbeddingErrorCode;

  constructor(code: EmbeddingErrorCode, message: string) {
    super(message);
    this.name = "EmbeddingError";
    this.code = code;
  }
}

export class ProviderUnavailableError extends EmbeddingError {
  constructor() {
    super("PROVIDER_UNAVAILABLE", "The local embedding provider is unavailable.");
  }
}

export class ModelUnavailableError extends EmbeddingError {
  constructor(model: string) {
    super("MODEL_UNAVAILABLE", `The configured embedding model is unavailable: ${model}.`);
  }
}

export class RequestTimeoutError extends EmbeddingError {
  constructor() {
    super("REQUEST_TIMEOUT", "The embedding request timed out.");
  }
}

export class InvalidRequestError extends EmbeddingError {
  constructor(message = "Embedding input is invalid.") {
    super("INVALID_REQUEST", message);
  }
}

export class MalformedResponseError extends EmbeddingError {
  constructor() {
    super("MALFORMED_RESPONSE", "The embedding provider returned an invalid response.");
  }
}

export class DimensionMismatchError extends EmbeddingError {
  constructor(expected: number, received: number) {
    super("DIMENSION_MISMATCH", `The embedding dimension was ${received}; expected the verified dimension ${expected}.`);
  }
}

export class EmbeddingFailedError extends EmbeddingError {
  constructor() {
    super("EMBEDDING_FAILED", "The embedding request failed.");
  }
}
