import { getCorrelationId } from "@/lib/observability/correlation";
import { redactLogValue, safeErrorSummary } from "@/lib/observability/redaction";

function write(level: "info" | "error", event: string, fields: Record<string, unknown> = {}): void {
  const record = redactLogValue({ level, event, correlationId: getCorrelationId(), ...fields });
  const serialized = JSON.stringify(record);
  if (level === "error") console.error(serialized);
  else console.log(serialized);
}

export function logInfo(event: string, fields?: Record<string, unknown>): void {
  write("info", event, fields);
}

export function logError(event: string, error?: unknown, fields: Record<string, unknown> = {}): void {
  write("error", event, { ...fields, error: error === undefined ? undefined : safeErrorSummary(error) });
}
