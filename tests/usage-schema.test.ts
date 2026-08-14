import { describe, expect, it } from "vitest";
import { workspaceUsageAdmissions, workspaceUsageBuckets } from "@/lib/database/schema";

describe("workspace usage schema", () => {
  it("exports durable usage buckets and logical admission identity", () => {
    expect(Object.keys(workspaceUsageBuckets)).toEqual(expect.arrayContaining([
      "id", "workspaceId", "metric", "bucketStart", "consumed", "updatedAt",
    ]));
    expect(Object.keys(workspaceUsageAdmissions)).toEqual(expect.arrayContaining([
      "id", "workspaceId", "metric", "operationKey", "sourceType", "sourceId", "bucketStart", "units", "createdAt",
    ]));
  });
});
