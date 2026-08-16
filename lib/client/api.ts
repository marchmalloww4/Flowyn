export type ClientError = {
  code: string;
  message: string;
  fields: Record<string, string[]>;
  runId: string | null;
  correlationId: string | null;
  retryable: boolean;
};

type ErrorBody = {
  runId?: unknown;
  error?: {
    code?: unknown;
    message?: unknown;
    fields?: unknown;
  };
};

const UNKNOWN_ERROR_MESSAGE = "Something went wrong. Try again or contact your workspace administrator.";

function asErrorBody(value: unknown): ErrorBody {
  if (!value || typeof value !== "object") return {};
  return value as ErrorBody;
}

function readFields(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, messages]) => {
    if (!Array.isArray(messages)) return [];
    const safeMessages = messages.filter((message): message is string => typeof message === "string");
    return safeMessages.length > 0 ? [[key, safeMessages]] : [];
  }));
}

function messageForCode(code: string, responseMessage: string | null): string {
  if (code === "VALIDATION_ERROR" || code === "INVALID_REQUEST") return "Check the highlighted fields.";
  if (code === "UNAUTHENTICATED") return "Your session has expired. Sign in again.";
  if (code === "WORKSPACE_FORBIDDEN") return "You do not have access to this workspace.";
  if (code === "WORKSPACE_NOT_FOUND" || code === "RESOURCE_NOT_FOUND") return "The requested resource was not found.";
  if (code === "WORKFLOW_VERSION_CONFLICT") return "This workflow changed elsewhere. Reload the latest version before saving again.";
  if (code.includes("QUOTA") || code.includes("RATE_LIMIT")) return "This workspace has reached an operating limit. Try again later or review Usage and Operations.";
  if (code.includes("CONCURRENCY")) return "This workspace is busy. Try again after an active operation finishes.";
  if (code.includes("AMBIGUOUS")) return "The external action outcome is unknown. Do not retry automatically.";
  if (code === "AGENT_UNGROUNDED_OUTPUT") return "The agent generated business claims that could not be verified from your saved brand information. Review or add the missing facts and run again.";
  if (code.includes("PROVIDER") || code.includes("OLLAMA") || code.includes("MODEL") || code.includes("EMBEDDING")) return "The AI provider is temporarily unavailable. Try again later.";
  if (code.startsWith("WEBHOOK_")) return "The webhook operation could not be completed.";
  if (code.startsWith("INTEGRATION_")) return "The integration operation could not be completed.";
  if (code.startsWith("WORKFLOW_")) return responseMessage && responseMessage.length <= 160 ? responseMessage : "The workflow operation could not be completed.";
  if (code.startsWith("AI_")) return "The AI operation could not be completed.";
  if (code === "NETWORK_ERROR") return "Flowyn could not reach the server. Check your connection and try again.";
  return responseMessage && responseMessage.length <= 160 && !/password|secret|token|stack|sql|database|provider/i.test(responseMessage) ? responseMessage : UNKNOWN_ERROR_MESSAGE;
}

export function mapApiError(response: Response, body: unknown): ClientError {
  const parsed = asErrorBody(body);
  const rawCode = parsed.error?.code;
  const code = typeof rawCode === "string" && rawCode.trim() ? rawCode : `HTTP_${response.status}`;
  const rawMessage = parsed.error?.message;
  const responseMessage = typeof rawMessage === "string" ? rawMessage : null;
  return {
    code,
    message: messageForCode(code, responseMessage),
    fields: readFields(parsed.error?.fields),
    runId: typeof parsed.runId === "string" ? parsed.runId : null,
    correlationId: response.headers.get("x-flowyn-correlation-id"),
    retryable: false,
  };
}

export class FlowynClientError extends Error {
  constructor(public readonly details: ClientError) {
    super(details.message);
    this.name = "FlowynClientError";
  }
}

export async function apiRequest<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new FlowynClientError({
      code: "NETWORK_ERROR",
      message: messageForCode("NETWORK_ERROR", null),
      fields: {},
      runId: null,
      correlationId: null,
      retryable: false,
    });
  }

  const body = response.status === 204 ? null : await response.json().catch(() => null) as unknown;
  if (!response.ok) throw new FlowynClientError(mapApiError(response, body));
  return body as T;
}
