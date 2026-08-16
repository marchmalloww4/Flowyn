import { describe, expect, it } from "vitest";
import { AGENT_TOOL_CATALOG } from "@/lib/agents/catalog";
import { createDefaultToolRegistry } from "@/lib/agents/registry";

describe("agent tool catalog contract", () => {
  it("uses the exact runtime identifiers and brand requirements", () => {
    const registry = createDefaultToolRegistry();

    expect(AGENT_TOOL_CATALOG.map((tool) => tool.name)).toEqual([
      "search_brand_knowledge",
      "get_brand_profile",
    ]);

    for (const tool of AGENT_TOOL_CATALOG) {
      expect(registry.get(tool.name).name).toBe(tool.name);
      expect(registry.get(tool.name).requiresBrand).toBe(tool.requiresBrand);
    }
  });
});
