import { describe, expect, it } from "vitest";
import * as schema from "@/lib/database/schema";

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
});