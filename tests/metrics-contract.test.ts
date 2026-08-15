import { describe, expect, it } from "vitest";
import { createMetrics, allowedMetricNames } from "@/lib/observability/metrics";

describe("metrics contract", () => {
  it("accepts only bounded low-cardinality metric labels", () => {
    const sink = createMetrics();
    expect(allowedMetricNames).toContain("flowyn_http_errors_total");
    expect(() => sink.increment("flowyn_http_errors_total", { operation: "ai_generate", status: "500" })).not.toThrow();
    expect(() => sink.increment("flowyn_http_errors_total", { workspaceId: "workspace-a" })).toThrow();
    expect(() => sink.increment("unknown_metric", {})).toThrow();
  });

  it("bounds metric label values", () => {
    const sink = createMetrics();
    expect(() => sink.observe("flowyn_ai_provider_outcomes_total", 12, { provider: "ollama", operation: "x".repeat(100) })).toThrow();
  });
});
