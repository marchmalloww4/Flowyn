import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const overview = readFileSync("components/dashboard/overview-page.tsx", "utf8");
const editor = readFileSync("components/forms/workflow-editor.tsx", "utf8");

describe("M14 performance boundaries", () => {
  it("keeps the overview from importing unrelated feature panels", () => {
    expect(overview).not.toContain("components/forms/agent-panel");
    expect(overview).not.toContain("components/forms/workflow-panel");
    expect(overview).toContain("/api/brands?");
    expect(overview).toContain("/api/workflows?");
  });

  it("defers the visual workflow canvas while preserving the editor route", () => {
    expect(editor).toContain('dynamic(');
    expect(editor).toContain('workflow-editor/workflow-canvas');
    expect(editor).toContain('ssr: false');
    expect(editor).toContain("WorkflowStepList");
  });
});
