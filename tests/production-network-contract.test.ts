import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production network contract", () => {
  const production = readFileSync("docker-compose.production.yml", "utf8");

  it("attaches only the worker to a pre-created external egress network", () => {
    expect(production).toContain("FLOWYN_WORKER_EGRESS_NETWORK:?FLOWYN_WORKER_EGRESS_NETWORK must be set");
    expect(production).toMatch(/worker:[\s\S]*networks:\s*\n\s+- private\s*\n\s+- egress/u);
    expect(production).toMatch(/egress:\s*\n\s+name: \$\{FLOWYN_WORKER_EGRESS_NETWORK:\?FLOWYN_WORKER_EGRESS_NETWORK must be set\}\s*\n\s+external: true/u);
    expect(production.match(/^\s+- egress\s*$/gmu)?.length).toBe(1);
    expect(production).not.toMatch(/egress:\s*\n\s+driver:\s+bridge/u);
  });

  it("keeps provider egress opt-in and the private services isolated", () => {
    expect(production).toContain("INTEGRATION_EGRESS_ENABLED: ${INTEGRATION_EGRESS_ENABLED:-false}");
    expect(production).toMatch(/app:[\s\S]*networks:[\s\S]*- private[\s\S]*- ingress/u);
    expect(production).toMatch(/scheduler:[\s\S]*networks:\s+\[private\]/u);
    expect(production).toMatch(/postgres:[\s\S]*networks:\s+\[private\]/u);
    expect(production).toMatch(/redis:[\s\S]*networks:\s+\[private\]/u);
    expect(production).toMatch(/ollama:[\s\S]*networks:\s+\[private\]/u);
    expect(production).toMatch(/private:\s*\n\s+internal: true/u);
  });
});
