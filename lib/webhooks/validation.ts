import { z } from "zod";
import { WEBHOOK_POLICY } from "@/lib/webhooks/policy";

const uuidSchema = z.string().uuid();

export const webhookCreateSchema = z.object({
  workspaceId: uuidSchema,
  workflowId: uuidSchema,
  name: z.string().trim().min(1).max(WEBHOOK_POLICY.maxNameChars),
}).strict();

export const webhookUpdateSchema = z.object({
  name: z.string().trim().min(1).max(WEBHOOK_POLICY.maxNameChars).optional(),
  workflowId: uuidSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "At least one webhook field is required.");

export const webhookListQuerySchema = z.object({ workspaceId: uuidSchema }).strict();

export const webhookHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100),
}).strict();

function validateSafeJsonValue(value: unknown, depth: number, path: string): void {
  if (depth > WEBHOOK_POLICY.maxDepth) {
    throw new Error(`Webhook payload exceeds maximum depth at ${path}.`);
  }

  if (value === null || typeof value === "string" || typeof value === "boolean") {
    if (typeof value === "string" && value.length > WEBHOOK_POLICY.maxStringChars) {
      throw new Error(`Webhook payload contains an oversized string at ${path}.`);
    }
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Webhook payload contains a non-finite number at ${path}.`);
    }
    return;
  }

  if (Array.isArray(value)) {
    if (value.length > WEBHOOK_POLICY.maxArrayItems) {
      throw new Error(`Webhook payload contains too many array items at ${path}.`);
    }
    value.forEach((item, index) => validateSafeJsonValue(item, depth + 1, `${path}[${index}]`));
    return;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > WEBHOOK_POLICY.maxObjectKeys) {
      throw new Error(`Webhook payload contains too many object keys at ${path}.`);
    }
    for (const [key, nested] of entries) {
      if (/^(workspaceid|userid|workflowid|principal|role|tools?|model|endpoint|exec|command|sql|filesystem)$/i.test(key)) {
        throw new Error(`Webhook payload contains a reserved capability field at ${path}.${key}.`);
      }
      validateSafeJsonValue(nested, depth + 1, `${path}.${key}`);
    }
    return;
  }

  throw new Error(`Webhook payload contains an unsupported value at ${path}.`);
}

export function validateWebhookPayload(rawBody: Uint8Array): Record<string, unknown> {
  if (rawBody.byteLength > WEBHOOK_POLICY.maxBodyBytes) {
    throw new Error("Webhook payload is too large.");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
  } catch {
    throw new Error("Webhook payload is not valid UTF-8.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Webhook payload is not valid JSON.");
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Webhook payload must be a JSON object.");
  }

  validateSafeJsonValue(parsed, 0, "$body");
  if (text.length > WEBHOOK_POLICY.maxInputChars) {
    throw new Error("Webhook payload is too large.");
  }
  return parsed as Record<string, unknown>;
}
