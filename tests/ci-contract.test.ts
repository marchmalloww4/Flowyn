import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("release workflow contracts", () => {
  it("keeps verification and security gates explicit", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    const security = readFileSync(".github/workflows/security.yml", "utf8");
    const release = readFileSync(".github/workflows/release-artifact.yml", "utf8");
    for (const command of ["npm ci", "npm run typecheck", "npm run lint", "npm test -- --run", "npm run build", "docker compose config"]) expect(ci).toContain(command);
    expect(security).toContain("npm audit --audit-level=high");
    expect(security).toContain("gitleaks");
    expect(release).toContain("docker/production.Dockerfile");
    expect(release).toContain("trivy");
    expect(release).not.toMatch(/docker compose.*up|npm run db:migrate|npm run db:push|docker push/iu);
  });
});
