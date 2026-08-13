import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBrand } from "@/lib/brands/service";
import { retrieveKnowledge } from "@/lib/knowledge/retrieval";
import { getBrandContext } from "@/lib/knowledge/brand-context";

vi.mock("@/lib/brands/service", () => ({ getBrand: vi.fn() }));
vi.mock("@/lib/knowledge/retrieval", () => ({ retrieveKnowledge: vi.fn() }));

const workspaceId = "11111111-1111-4111-8111-111111111111";
const brandId = "22222222-2222-4222-8222-222222222222";

function database() {
  const rows = [
    [{ structuredProfile: { voice: "warm" } }],
    [{ kind: "tone", value: "Use a warm voice", explanation: null }],
    [{ content: "Welcome examples", source: "site", explanation: null }],
  ];
  const orderBy = vi.fn();
  const select = vi.fn().mockImplementation(() => {
    const result = rows.shift() ?? [];
    const limited = { limit: vi.fn().mockResolvedValue(result) };
    orderBy.mockReturnValue(limited);
    return { from: () => ({ where: () => ({ orderBy, limit: limited.limit }) }) };
  });
  return { select, orderBy };
}

describe("hybrid BrandContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBrand).mockResolvedValue({ id: brandId, workspaceId, name: "Acme", tone: "clear", writingRules: ["Be useful"] } as never);
    vi.mocked(retrieveKnowledge).mockResolvedValue([{ documentId: "doc-1", title: "Facts", sourceType: "manual", sourceName: "Notes", stableKey: "doc-1:0:hash", content: "A product fact", metadata: {}, similarity: 0.9 }]);
  });

  it("combines structured brand data and bounded retrieved knowledge", async () => {
    const db = database();
    const context = await getBrandContext({ userId: "user-1", brandId, query: "product", includeKnowledge: true }, db as never);

    expect(context.brand.name).toBe("Acme");
    expect(context.voiceProfile).toEqual({ voice: "warm" });
    expect(context.rules).toHaveLength(1);
    expect(context.examples).toHaveLength(1);
    expect(context.knowledge).toHaveLength(1);
    expect(db.orderBy).toHaveBeenCalledTimes(2);
    expect(retrieveKnowledge).toHaveBeenCalledWith(expect.objectContaining({ brandId, query: "product" }), expect.anything());
  });

  it("does not retrieve knowledge when disabled", async () => {
    const context = await getBrandContext({ userId: "user-1", brandId, includeKnowledge: false }, database() as never);

    expect(context.knowledge).toEqual([]);
    expect(retrieveKnowledge).not.toHaveBeenCalled();
  });
});
