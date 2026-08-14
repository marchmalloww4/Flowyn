import { describe, expect, it } from "vitest";
import { parseWorkflowEditorLayout } from "@/lib/workflows/editor-layout";

const validLayout = {
  nodes: [{ id: "start", x: 120, y: -40 }],
  viewport: { x: 10, y: 20, zoom: 1.25 },
};

describe("workflow editor layout validation", () => {
  it("accepts bounded visual positions and viewport values", () => {
    expect(parseWorkflowEditorLayout(validLayout)).toEqual(validLayout);
  });

  it("rejects executable configuration embedded in layout metadata", () => {
    expect(() => parseWorkflowEditorLayout({ ...validLayout, config: { type: "SHELL" } })).toThrow();
    expect(() => parseWorkflowEditorLayout({ nodes: [{ id: "start", x: 120, y: -40 }, { id: "start", x: 0, y: 0 }], viewport: validLayout.viewport })).toThrow();
  });

  it("rejects out-of-bounds coordinates and viewport zoom", () => {
    expect(() => parseWorkflowEditorLayout({ nodes: [{ id: "start", x: 1_000_001, y: 0 }], viewport: validLayout.viewport })).toThrow();
    expect(() => parseWorkflowEditorLayout({ nodes: validLayout.nodes, viewport: { x: 0, y: 0, zoom: 0 } })).toThrow();
  });
});
