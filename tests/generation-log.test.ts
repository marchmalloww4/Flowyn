import { describe, expect, it, vi } from "vitest";
import { recordGenerationLog } from "@/lib/ai/generation-log";
import type { Database } from "@/lib/database";

describe("generation logging", () => {
  it("persists safe metadata without prompt or response fields", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const db = { insert: vi.fn().mockReturnValue({ values }) } as unknown as Database;

    await recordGenerationLog({ workspaceId: "workspace-id", userId: "user-id", provider: "ollama", model: "llama3.2:3b", status: "SUCCEEDED", durationMs: 120, inputChars: 24, outputChars: 48 }, db);

    expect(values).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "workspace-id", provider: "ollama", model: "llama3.2:3b", status: "SUCCEEDED", inputChars: 24, outputChars: 48 }));
    expect(JSON.stringify(values.mock.calls[0]?.[0])).not.toContain("prompt");
    expect(JSON.stringify(values.mock.calls[0]?.[0])).not.toContain("response");
  });
});
