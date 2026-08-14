import { describe, expect, it } from "vitest";
import { createWorkflowContext, resolveWorkflowValue, sanitizeWorkflowValue } from "@/lib/workflows/context";

describe("workflow context safety", () => {
  it("resolves bounded trigger and step references", () => {
    const context = createWorkflowContext({
      triggerInput: { customer: { name: "Ada" } },
      stepOutputs: { lookup: { value: "violet" } },
    });

    expect(resolveWorkflowValue({ kind: "reference", path: "trigger.customer.name" }, context)).toBe("Ada");
    expect(resolveWorkflowValue({ kind: "reference", path: "steps.lookup.output.value" }, context)).toBe("violet");
  });

  it("rejects prototype-pollution reference segments", () => {
    const context = createWorkflowContext({ triggerInput: {}, stepOutputs: {} });

    expect(() => resolveWorkflowValue({ kind: "reference", path: "steps.lookup.output.__proto__" }, context)).toThrow("unsafe");
  });

  it("rejects values that exceed the bounded context", () => {
    expect(() => sanitizeWorkflowValue("x".repeat(25000))).toThrow("context");
    expect(() => createWorkflowContext({ triggerInput: { value: "x".repeat(25000) }, stepOutputs: {} })).toThrow("context");
  });

  it("does not retain dangerous object prototypes", () => {
    const sanitized = sanitizeWorkflowValue(JSON.parse('{"constructor":{"prototype":{"polluted":true}},"ok":"yes"}')) as Record<string, unknown>;

    expect(sanitized).toEqual({ ok: "yes" });
    expect(Object.getPrototypeOf(sanitized)).toBe(Object.prototype);
  });
});
