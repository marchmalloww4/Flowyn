import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const files = ["README.md", "SETUP.md", "ARCHITECTURE.md", "SECURITY.md", "AI.md"];

describe("M13 documentation contract", () => {
  it("documents local/production separation and release safety", () => {
    const contents = files.map((file) => readFileSync(file, "utf8")).join("\n");
    for (const phrase of ["Milestone 13", "production", "private", "backup", "restore", "Idempotency", "stream", "db:push"]) expect(contents.toLowerCase()).toContain(phrase.toLowerCase());
    expect(readFileSync("docs/operations/dependency-vulnerability-response.md", "utf8")).toContain("npm audit fix --force");
    expect(readFileSync("docs/operations/backup-restore.md", "utf8")).toContain("TemporaryTargetConfirmed");
  });
});
