import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production artifact contract", () => {
  it("requires one explicit image for all application roles", () => {
    const production = readFileSync("docker-compose.production.yml", "utf8");
    const local = readFileSync("docker-compose.yml", "utf8");

    expect(production).toContain("FLOWYN_IMAGE:?FLOWYN_IMAGE must be set");
    expect(production).not.toMatch(/^\s+build:/mu);
    expect(production.match(/image: \*flowyn-image/gu)?.length).toBe(4);
    expect(local).toContain("build:");
  });

  it("records source and immutable artifact identity in the release workflow", () => {
    const release = readFileSync(".github/workflows/release-artifact.yml", "utf8");

    expect(release).toContain("github.sha");
    expect(release).toContain("image-digest.json");
    expect(release).toContain("image_id");
    expect(release).toContain("sbom: true");
    expect(release).toContain("provenance: true");
  });

  it("removes optional development tooling that npm retains through peer resolution", () => {
    const dockerfile = readFileSync("docker/production.Dockerfile", "utf8");

    expect(dockerfile).toContain("npm ci --omit=dev --ignore-scripts");
    expect(dockerfile).toContain("node_modules/drizzle-kit");
    expect(dockerfile).toContain("node_modules/@drizzle-team");
    expect(dockerfile).toContain("node_modules/@esbuild-kit");
    expect(dockerfile).toContain("node_modules/esbuild");
    expect(dockerfile).toContain("node_modules/@esbuild");
    expect(dockerfile).toContain("node_modules/tsx");
  });

  it("does not require the npm CLI in the production runtime", () => {
    const production = readFileSync("docker-compose.production.yml", "utf8");
    const dockerfile = readFileSync("docker/production.Dockerfile", "utf8");

    expect(production).toContain('command: ["node", "--import", "tsx", "lib/database/migrate.ts"]');
    expect(production).toContain('command: ["node", "--import", "tsx", "worker/workflow-worker.ts"]');
    expect(production).toContain('command: ["node", "--import", "tsx", "worker/workflow-scheduler.ts"]');
    expect(production).toContain('test: ["CMD-SHELL", "node --import tsx scripts/check-worker-health.ts"]');
    expect(production).toContain('test: ["CMD-SHELL", "node --import tsx scripts/check-scheduler-health.ts"]');
    expect(dockerfile).toContain("/usr/local/lib/node_modules/npm");
    expect(dockerfile).toContain("/usr/local/bin/npm");
    expect(dockerfile).toContain("/usr/local/bin/npx");
  });
});
