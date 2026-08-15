import { describe, expect, it } from "vitest";
import { navigationItems } from "@/components/flowyn-shell";

describe("authenticated navigation", () => {
  it("exposes the approved product routes in order", () => {
    expect(navigationItems.map((item) => item.href)).toEqual([
      "/dashboard",
      "/dashboard/brands",
      "/dashboard/knowledge",
      "/dashboard/ai",
      "/dashboard/agents",
      "/dashboard/workflows",
      "/dashboard/schedules",
      "/dashboard/webhooks",
      "/dashboard/approvals",
      "/dashboard/integrations",
      "/dashboard/operations",
      "/dashboard/settings",
    ]);
  });

  it("uses product language rather than placeholder labels", () => {
    expect(navigationItems.map((item) => item.label)).toEqual([
      "Overview",
      "Brands",
      "Knowledge",
      "AI",
      "Agents",
      "Workflows",
      "Schedules",
      "Webhooks",
      "Approvals",
      "Integrations",
      "Usage / Operations",
      "Workspace / Settings",
    ]);
  });
});
