import { describe, expect, it } from "vitest";
import { addMemberSchema, workspaceRoleSchema } from "@/lib/memberships/validation";

describe("workspace membership validation", () => {
  it("accepts only the supported uppercase roles", () => {
    expect(workspaceRoleSchema.parse({ role: "OWNER" })).toEqual({ role: "OWNER" });
    expect(workspaceRoleSchema.parse({ role: "ADMIN" })).toEqual({ role: "ADMIN" });
    expect(workspaceRoleSchema.parse({ role: "MEMBER" })).toEqual({ role: "MEMBER" });
    expect(() => workspaceRoleSchema.parse({ role: "owner" })).toThrow();
  });

  it("allows invitations only for ordinary member roles", () => {
    expect(addMemberSchema.parse({ email: "member@example.com" })).toEqual({ email: "member@example.com", role: "MEMBER" });
    expect(addMemberSchema.parse({ email: "admin@example.com", role: "ADMIN" }).role).toBe("ADMIN");
    expect(() => addMemberSchema.parse({ email: "owner@example.com", role: "OWNER" })).toThrow();
  });
});
