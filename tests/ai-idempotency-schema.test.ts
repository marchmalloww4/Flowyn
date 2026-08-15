import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { aiGenerationIdempotency } from "@/lib/database/schema";

describe("AI idempotency schema", () => {
  it("keeps replay state workspace-scoped and stores only encrypted response material", () => {
    const columns = getTableColumns(aiGenerationIdempotency);
    expect(Object.keys(columns)).toEqual(expect.arrayContaining([
      "workspaceId",
      "operationKeyHash",
      "requestFingerprint",
      "mode",
      "status",
      "responseCiphertext",
      "responseKeyVersion",
      "errorCode",
      "correlationId",
      "createdAt",
      "updatedAt",
      "completedAt",
      "expiresAt",
    ]));
    expect(columns.responseCiphertext.notNull).toBe(false);
    expect(columns.workspaceId.notNull).toBe(true);
  });
});
