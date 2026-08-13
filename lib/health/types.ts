export type HealthStatus = "ok" | "error";

export interface HealthResult {
  status: HealthStatus;
  service: string;
  latencyMs?: number;
  errorCode?: string;
}

export class HealthCheckError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "HealthCheckError";
  }
}