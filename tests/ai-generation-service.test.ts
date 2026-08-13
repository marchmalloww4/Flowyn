import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/security/errors";
import { ProviderUnavailableError } from "@/lib/ai/errors";
import type { LLMProvider } from "@/lib/ai/types";

const { requireWorkspaceMember, getBrand, recordGenerationLog } = vi.hoisted(() => ({
  requireWorkspaceMember: vi.fn(),
  getBrand: vi.fn(),
  recordGenerationLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/authz/authorization", () => ({ requireWorkspaceMember }));
vi.mock("@/lib/brands/service", () => ({ getBrand }));
vi.mock("@/lib/ai/generation-log", () => ({ recordGenerationLog }));

import { generateText, prepareGeneration } from "@/lib/ai/service";

const provider: LLMProvider = {
  generate: vi.fn().mockResolvedValue({ text: "Generated output", model: "llama3.2:3b", done: true, durationMs: 12 }),
  generateStructured: vi.fn(),
  stream: vi.fn(),
  health: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  requireWorkspaceMember.mockResolvedValue({ workspaceId: "11111111-1111-4111-8111-111111111111", userId: "user-1", role: "MEMBER" });
  getBrand.mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222", workspaceId: "11111111-1111-4111-8111-111111111111", name: "Acme", tone: "clear" });
  provider.generate = vi.fn().mockResolvedValue({ text: "Generated output", model: "llama3.2:3b", done: true, durationMs: 12 });
});

describe("workspace-scoped generation service", () => {
  it("requires workspace membership before preparing a generation", async () => {
    requireWorkspaceMember.mockRejectedValue(new AppError("WORKSPACE_NOT_FOUND", 404, "Workspace not found."));

    await expect(prepareGeneration({ userId: "user-1", workspaceId: "11111111-1111-4111-8111-111111111111", prompt: "Hello" }, provider)).rejects.toMatchObject({ code: "WORKSPACE_NOT_FOUND" });
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("rejects a brand from another workspace without exposing it", async () => {
    getBrand.mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222", workspaceId: "33333333-3333-4333-8333-333333333333", name: "Other" });

    await expect(prepareGeneration({ userId: "user-1", workspaceId: "11111111-1111-4111-8111-111111111111", brandId: "22222222-2222-4222-8222-222222222222", prompt: "Hello" }, provider)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND", status: 404 });
  });

  it("preserves the Milestone 3 provider input when RAG is disabled", async () => {
    const prepared = await prepareGeneration({ userId: "user-1", workspaceId: "11111111-1111-4111-8111-111111111111", brandId: "22222222-2222-4222-8222-222222222222", prompt: "Hello" }, provider);

    expect(prepared.providerInput.system).toBeUndefined();
    expect(prepared.providerInput.prompt).toBe("User instructions:\nHello\n\nBrand context:\nName: Acme\nTone: clear");
  });

  it("logs successful generation metadata without prompt or response content", async () => {
    const prepared = await prepareGeneration({ userId: "user-1", workspaceId: "11111111-1111-4111-8111-111111111111", prompt: "Hello" }, provider);
    await expect(generateText(prepared, {} as never)).resolves.toMatchObject({ text: "Generated output" });

    expect(recordGenerationLog).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: prepared.workspaceId, userId: "user-1", status: "SUCCEEDED", inputChars: expect.any(Number), outputChars: 16 }), {});
    expect(JSON.stringify(recordGenerationLog.mock.calls[0]?.[0])).not.toContain("Generated output");
  });

  it("logs provider failures with a safe error code", async () => {
    provider.generate = vi.fn().mockRejectedValue(new ProviderUnavailableError());
    const prepared = await prepareGeneration({ userId: "user-1", workspaceId: "11111111-1111-4111-8111-111111111111", prompt: "Hello" }, provider);

    await expect(generateText(prepared, {} as never)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(recordGenerationLog).toHaveBeenCalledWith(expect.objectContaining({ status: "FAILED", errorCode: "PROVIDER_UNAVAILABLE" }), {});
  });
});
