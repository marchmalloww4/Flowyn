export const allowedMetricNames = [
  "flowyn_http_errors_total",
  "flowyn_http_latency_ms",
  "flowyn_readiness_failures_total",
  "flowyn_outbox_transitions_total",
  "flowyn_workflow_outcomes_total",
  "flowyn_worker_jobs_total",
  "flowyn_scheduler_lag_ms",
  "flowyn_admission_decisions_total",
  "flowyn_concurrency_saturation_total",
  "flowyn_ai_idempotency_total",
  "flowyn_ai_provider_outcomes_total",
  "flowyn_integration_outcomes_total",
] as const;

type MetricName = typeof allowedMetricNames[number];
type MetricLabels = Record<string, string>;
const allowedLabelKeys = new Set(["operation", "status", "service", "role", "provider", "outcome", "failure_category", "mode", "metric"]);
const allowedNames = new Set<string>(allowedMetricNames);

function validate(name: string, labels: MetricLabels): asserts name is MetricName {
  if (!allowedNames.has(name)) throw new Error("Metric name is not allowed.");
  for (const [key, value] of Object.entries(labels)) {
    if (!allowedLabelKeys.has(key) || value.length === 0 || value.length > 48 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error("Metric labels are outside the supported bounds.");
  }
}

export interface MetricSink {
  increment(name: string, labels?: MetricLabels, value?: number): void;
  observe(name: string, value: number, labels?: MetricLabels): void;
  gauge(name: string, value: number, labels?: MetricLabels): void;
}

export function createMetrics(): MetricSink {
  const sink = (name: string, labels: MetricLabels = {}, value = 1): void => {
    validate(name, labels);
    if (!Number.isFinite(value) || value < 0) throw new Error("Metric value is outside the supported bounds.");
  };
  return {
    increment: sink,
    observe: (name, value, labels = {}) => sink(name, labels, value),
    gauge: (name, value, labels = {}) => sink(name, labels, value),
  };
}

export const metrics = createMetrics();
