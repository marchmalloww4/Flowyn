import { describe, expect, it } from "vitest";
import * as schema from "@/lib/database/schema";
import { WORKSPACE_ROLES } from "@/lib/workspaces/roles";

describe("Milestone 1 database schema", () => {
  it("exports the authentication, tenant, brand, and audit tables", () => {
    expect(Object.keys(schema.schema)).toEqual(expect.arrayContaining([
      "user", "session", "account", "verification", "workspaces", "workspaceMembers",
      "brands", "brandVoiceProfiles", "brandRules", "brandExamples", "auditLogs",
    ]));
  });

  it("keeps brand records scoped to a workspace", () => {
    expect(schema.brands.workspaceId).toBeDefined();
    expect(schema.workspaceMembers.workspaceId).toBeDefined();
    expect(schema.auditLogs.workspaceId).toBeDefined();
  });

  it("defines the role values used by the database constraint", () => {
    expect(WORKSPACE_ROLES).toEqual(["OWNER", "ADMIN", "MEMBER"]);
    expect(schema.workspaceMembers.role).toBeDefined();
  });
});
