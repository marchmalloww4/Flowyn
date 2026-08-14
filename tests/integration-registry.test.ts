import { describe, expect, it } from "vitest";
import { getConnectorDefinition, getConnectorOperation, getIntegrationCatalog } from "@/lib/integrations/registry";

describe("static integration registry", () => {
  it("exposes only the approved Slack operation", () => {
    const catalog = getIntegrationCatalog();
    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({ id: "slack", authType: "API_TOKEN" });
    expect(catalog[0]?.operations).toEqual([
      expect.objectContaining({ id: "post_message", requiresApproval: true, risk: "EXTERNAL_SIDE_EFFECT" }),
    ]);
    expect(getConnectorDefinition("slack").id).toBe("slack");
    expect(getConnectorOperation("slack", "post_message").id).toBe("post_message");
  });

  it("rejects unknown registry identifiers", () => {
    expect(() => getConnectorDefinition("github" as never)).toThrowError(/connector/i);
    expect(() => getConnectorOperation("slack", "send_file" as never)).toThrowError(/operation/i);
  });

  it("keeps approval as operation metadata", () => {
    expect(getConnectorOperation("slack", "post_message").requiresApproval).toBe(true);
    expect("requiresApproval" in getConnectorDefinition("slack")).toBe(false);
  });
});
