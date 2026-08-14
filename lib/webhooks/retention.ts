const DEFAULT_CLEANUP_BATCH = 100;
const MAX_CLEANUP_BATCH = 500;

export function getWebhookEventExpiry(receivedAt: Date, retentionDays: number): Date {
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) {
    throw new Error("Webhook event retention is outside the supported range.");
  }
  return new Date(receivedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000);
}

export function isWebhookEventExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() < now.getTime();
}

export function normalizeWebhookCleanupBatch(batchSize: number | undefined): number {
  if (batchSize === undefined) return DEFAULT_CLEANUP_BATCH;
  if (!Number.isFinite(batchSize)) return DEFAULT_CLEANUP_BATCH;
  return Math.min(MAX_CLEANUP_BATCH, Math.max(1, Math.floor(batchSize)));
}
