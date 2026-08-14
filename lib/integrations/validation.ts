import { z } from "zod";
import { containsControlCharacters, INTEGRATION_CHANNEL_MAX_LENGTH, INTEGRATION_CREDENTIAL_NAME_MAX_LENGTH, INTEGRATION_SECRET_MAX_LENGTH, INTEGRATION_TEXT_MAX_LENGTH } from "@/lib/integrations/policy";
import type { IntegrationActionConfig, IntegrationSecretMaterial, SlackPostMessageInput, SlackPostMessageOutput } from "@/lib/integrations/types";
import type { JsonValue } from "@/lib/workflows/types";

const boundedJson = (value: unknown, depth = 0): boolean => {
  if (value === null || typeof value === "boolean" || typeof value === "number") return typeof value !== "number" || Number.isFinite(value);
  if (typeof value === "string") return value.length <= 12000;
  if (depth >= 3 || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.length <= 20 && value.every((item) => boundedJson(item, depth + 1));
  return Object.entries(value).length <= 20 && Object.entries(value).every(([key, nested]) => key.length <= 120 && boundedJson(nested, depth + 1));
};
const integrationExpressionSchema = z.union([
  z.object({ kind: z.literal("literal"), value: z.custom<JsonValue>((value) => boundedJson(value), "The expression value exceeds workflow bounds.") }).strict(),
  z.object({ kind: z.literal("reference"), path: z.string().trim().min(1).max(200) }).strict(),
]);

const safeText = (max: number) => z.string().min(1).max(max).refine((value) => value.trim().length > 0, "Value must not be blank.").refine((value) => !containsControlCharacters(value), "Control characters are not allowed.");

export const slackPostMessageInputSchema: z.ZodType<SlackPostMessageInput> = z.object({
  channel: safeText(INTEGRATION_CHANNEL_MAX_LENGTH),
  text: safeText(INTEGRATION_TEXT_MAX_LENGTH),
}).strict();

export const slackPostMessageOutputSchema: z.ZodType<SlackPostMessageOutput> = z.object({
  provider: z.literal("slack"),
  channel: safeText(INTEGRATION_CHANNEL_MAX_LENGTH),
  providerMessageId: z.string().min(1).max(200),
}).strict();

export const integrationSecretMaterialSchema: z.ZodType<IntegrationSecretMaterial> = z.object({
  apiToken: z.string().min(1).max(INTEGRATION_SECRET_MAX_LENGTH).refine((value) => !containsControlCharacters(value), "Control characters are not allowed."),
}).strict();

export const integrationActionConfigSchema: z.ZodType<IntegrationActionConfig> = z.object({
  connectorId: z.literal("slack"),
  credentialId: z.string().uuid(),
  operation: z.literal("post_message"),
  input: z.object({
    channel: integrationExpressionSchema,
    text: integrationExpressionSchema,
  }).strict(),
}).strict();

export const integrationCredentialNameSchema = safeText(INTEGRATION_CREDENTIAL_NAME_MAX_LENGTH);

export const integrationCredentialCreateSchema = z.object({
  workspaceId: z.string().uuid(),
  connectorId: z.literal("slack"),
  name: integrationCredentialNameSchema,
  secret: integrationSecretMaterialSchema,
}).strict();

export const integrationCredentialPatchSchema = z.object({ name: integrationCredentialNameSchema }).strict();
export const integrationCredentialRotateSchema = z.object({ secret: integrationSecretMaterialSchema }).strict();
export const integrationCredentialListQuerySchema = z.object({ workspaceId: z.string().uuid() }).strict();
