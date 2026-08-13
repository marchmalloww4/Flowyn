import { describe, expect, it } from "vitest";
import { readResponse } from "@/components/forms/knowledge-panel";

describe("knowledge panel response handling", () => {
  it("accepts a successful 204 delete response without parsing JSON", async () => {
    await expect(readResponse(new Response(null, { status: 204 }))).resolves.toBeUndefined();
  });
});
