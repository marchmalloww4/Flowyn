import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const correlationStorage = new AsyncLocalStorage<string>();
const validCorrelationId = /^[A-Za-z0-9._~-]{1,120}$/u;

export function getOrCreateCorrelationId(headers: Headers): string {
  const candidate = headers.get("x-request-id")?.trim();
  return candidate && validCorrelationId.test(candidate) ? candidate : randomUUID();
}

export function getCorrelationId(): string | null {
  return correlationStorage.getStore() ?? null;
}

export function runWithCorrelationId<T>(correlationId: string, callback: () => T): T {
  if (!validCorrelationId.test(correlationId)) throw new Error("Correlation ID is outside the supported bounds.");
  return correlationStorage.run(correlationId, callback);
}
