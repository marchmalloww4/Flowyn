import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");

describe("Milestone 14 documentation contract", () => {
  it("documents the current product experience and browser verification", () => {
    const read = (file: string) => readFileSync(resolve(root, file), "utf8");
    expect(read("README.md")).toContain("Milestones 1 through 14");
    expect(read("README.md")).toContain("npm run test:e2e");
    expect(read("ARCHITECTURE.md")).toContain("Milestone 14 product boundary");
    expect(read("SETUP.md")).toContain("disposable database");
    expect(read("docs/operations/browser-testing.md")).toContain("axe-core");
  });

  it("does not document a new migration or unrestricted M14 capability", () => {
    const plan = readFileSync(resolve(root, "docs/superpowers/plans/2026-08-15-milestone-14-product-experience-plan.md"), "utf8");
    expect(plan).toContain("M14 requires no database migration");
    expect(plan).toContain("M15");
    expect(plan).toContain("generic HTTP");
  });
});
