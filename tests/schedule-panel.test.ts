import { describe, expect, it } from "vitest";
import { readScheduleResponse } from "@/components/forms/schedule-panel";

describe("schedule panel response handling", () => {
  it("accepts a successful 204 response without parsing JSON", async () => {
    await expect(readScheduleResponse(new Response(null, { status: 204 }))).resolves.toBeUndefined();
  });

  it("exposes the server error message", async () => {
    await expect(readScheduleResponse(new Response(JSON.stringify({ error: { message: "Forbidden" } }), { status: 403 }))).rejects.toThrow("Forbidden");
  });
});
