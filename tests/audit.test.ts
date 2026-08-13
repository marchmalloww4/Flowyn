import { describe, expect, it } from "vitest";
import { sanitizeAuditMetadata } from "@/lib/audit/service";

describe("audit metadata safety", () => {
  it("removes secret-shaped fields before persistence", () => {
    const safe = sanitizeAuditMetadata({
      name: "Acme",
      password: "should-not-persist",
      token: "session-token",
      nested: { apiKey: "credential", changed: "tone" },
    });

    expect(safe).toEqual({ name: "Acme", nested: { changed: "tone" } });
  });
});
