import { describe, expect, it } from "vitest";
import { workspaceConcurrencyReservations, workspaceConcurrencyStates } from "@/lib/database/schema";

describe("workspace concurrency schema", () => {
  it("exports workspace-scoped state and expiring reservations", () => {
    expect(Object.keys(workspaceConcurrencyStates)).toEqual(expect.arrayContaining([
      "id", "workspaceId", "operationClass", "activeCount", "updatedAt",
    ]));
    expect(Object.keys(workspaceConcurrencyReservations)).toEqual(expect.arrayContaining([
      "id", "workspaceId", "operationClass", "sourceId", "ownerId", "expiresAt", "createdAt", "releasedAt",
    ]));
  });
});
