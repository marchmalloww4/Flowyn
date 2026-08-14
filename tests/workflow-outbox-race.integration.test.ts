import { describe, expect, it } from "vitest";
import { workflowJobId } from "@/lib/workflows/queue";

describe("workflow dispatch identity under retries", () => {
  it("uses a new deterministic generation only for a durable re-dispatch", () => {
    expect(workflowJobId("run-1", 0)).toBe("workflow-run:run-1");
    expect(workflowJobId("run-1", 1)).toBe("workflow-run:run-1:generation:1");
  });
});
