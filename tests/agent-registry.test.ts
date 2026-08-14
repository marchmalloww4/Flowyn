import { describe, expect, it } from "vitest";
import { ToolRegistry, type AgentTool } from "@/lib/agents/registry";

function tool(name: string, requiresBrand = false): AgentTool<{ query?: string }, { result: string }> {
  return {
    name,
    description: `${name} description`,
    inputSchema: {} as never,
    inputDescription: "{}",
    requiresBrand,
    execute: async () => ({ modelObservation: { result: "value" }, safeSummary: { metadata: {}, durationMs: 1, characterCount: 5 } }),
    serializeObservation: (output) => JSON.stringify(output),
  };
}

describe("agent tool registry", () => {
  it("registers exact names and rejects duplicates or unknown tools", () => {
    const registry = new ToolRegistry();
    registry.register(tool("example_tool"));

    expect(registry.get("example_tool").name).toBe("example_tool");
    expect(() => registry.register(tool("example_tool"))).toThrowError(expect.objectContaining({ code: "AGENT_DUPLICATE_TOOL" }));
    expect(() => registry.get("missing_tool")).toThrowError(expect.objectContaining({ code: "AGENT_UNKNOWN_TOOL" }));
  });

  it("intersects configured names with registered tools and trusted brand context", () => {
    const registry = new ToolRegistry();
    registry.register(tool("general_tool"));
    registry.register(tool("brand_tool", true));

    expect(registry.getEffectiveTools(["general_tool", "brand_tool", "missing_tool"], {}).map((entry) => entry.name)).toEqual(["general_tool"]);
    expect(registry.getEffectiveTools(["general_tool", "brand_tool"], { brandId: "brand-1" }).map((entry) => entry.name)).toEqual(["general_tool", "brand_tool"]);
  });

  it("returns public definitions only for the effective tools", () => {
    const registry = new ToolRegistry();
    registry.register(tool("general_tool"));
    registry.register(tool("brand_tool", true));

    expect(registry.getPublicDefinitions(["general_tool", "brand_tool"], {})).toEqual([{ name: "general_tool", description: "general_tool description", inputDescription: "{}" }]);
  });
});
