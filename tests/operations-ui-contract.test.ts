import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UsageSummary } from "@/components/forms/usage-summary";

describe("Milestone 12 operations UI contract", () => {
  it("renders bounded usage and concurrency fields without sensitive payloads", () => {
    const markup = renderToStaticMarkup(React.createElement(UsageSummary, { usage: { plan: "SELF_HOSTED", limits: { aiGenerationsPerDay: 500, concurrentAgents: 2 }, counters: { "AI_GENERATION_DAY:day": 3 }, concurrency: { AGENT: 1 }, rateLimit: { status: "degraded", note: "Redis status is summarized." } } }));
    expect(markup).toContain("SELF_HOSTED");
    expect(markup).toContain("AI generations per day");
    expect(markup).toContain("Concurrent agents");
    expect(markup).toContain("Redis status is summarized.");
    expect(markup).not.toMatch(/token|secret|prompt|response|credential|webhook body/iu);
  });
});
