export const WEBHOOK_POLICY = Object.freeze({
  maxBodyBytes: 262_144,
  maxEventIdChars: 256,
  maxNameChars: 120,
  maxInputChars: 12_000,
  maxDepth: 8,
  maxObjectKeys: 100,
  maxArrayItems: 100,
  maxStringChars: 12_000,
  replayWindowSeconds: 300,
  eventRetentionDays: 30,
  globalRateLimitPerMinute: 600,
  triggerRateLimitPerMinute: 120,
} as const);

export type WebhookTimestampValidation =
  | { ok: true; timestamp: number }
  | { ok: false; reason: "timestamp" | "replay_window" };

export function validateWebhookTimestamp(
  value: string,
  nowSeconds: number,
  replayWindowSeconds: number,
): WebhookTimestampValidation {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    return { ok: false, reason: "timestamp" };
  }

  const timestamp = Number(value);
  if (!Number.isSafeInteger(timestamp) || !Number.isSafeInteger(nowSeconds) || replayWindowSeconds < 0) {
    return { ok: false, reason: "timestamp" };
  }

  if (Math.abs(nowSeconds - timestamp) > replayWindowSeconds) {
    return { ok: false, reason: "replay_window" };
  }

  return { ok: true, timestamp };
}
