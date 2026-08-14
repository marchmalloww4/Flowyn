import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/security/errors";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getIntegrationCatalog: vi.fn(),
  createIntegrationCredential: vi.fn(),
  listIntegrationCredentials: vi.fn(),
  getIntegrationCredential: vi.fn(),
  updateIntegrationCredential: vi.fn(),
  revokeIntegrationCredential: vi.fn(),
  rotateIntegrationCredential: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/integrations/registry", () => ({ getIntegrationCatalog: mocks.getIntegrationCatalog }));
vi.mock("@/lib/integrations/credentials", () => ({
  createIntegrationCredential: mocks.createIntegrationCredential,
  listIntegrationCredentials: mocks.listIntegrationCredentials,
  getIntegrationCredential: mocks.getIntegrationCredential,
  updateIntegrationCredential: mocks.updateIntegrationCredential,
  revokeIntegrationCredential: mocks.revokeIntegrationCredential,
  rotateIntegrationCredential: mocks.rotateIntegrationCredential,
}));

import { GET as catalogGet } from "@/app/api/integrations/catalog/route";
import { GET as listGet, POST as createPost } from "@/app/api/integration-credentials/route";
import { DELETE as deleteRoute, GET as getRoute, PATCH as patchRoute } from "@/app/api/integration-credentials/[id]/route";
import { POST as rotatePost } from "@/app/api/integration-credentials/[id]/rotate/route";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const credentialId = "22222222-2222-4222-8222-222222222222";
const credential = { id: credentialId, workspaceId, connectorId: "slack", name: "Marketing", secretVersion: 1, revokedAt: null, deletedAt: null, lastUsedAt: null };
const context = { params: Promise.resolve({ id: credentialId }) };

function request(url: string, method: string, body?: unknown): Request {
  return new Request(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), headers: { "Content-Type": "application/json" } });
}

describe("integration credential routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.getIntegrationCatalog.mockReturnValue([{ id: "slack", displayName: "Slack", authType: "API_TOKEN", operations: [{ id: "post_message", requiresApproval: true, risk: "EXTERNAL_SIDE_EFFECT" }] }]);
    mocks.createIntegrationCredential.mockResolvedValue(credential);
    mocks.listIntegrationCredentials.mockResolvedValue([credential]);
    mocks.getIntegrationCredential.mockResolvedValue(credential);
    mocks.updateIntegrationCredential.mockResolvedValue({ ...credential, name: "Updated" });
    mocks.revokeIntegrationCredential.mockResolvedValue(undefined);
    mocks.rotateIntegrationCredential.mockResolvedValue({ ...credential, secretVersion: 2 });
  });

  it("authenticates catalog and credential management routes", async () => {
    expect((await catalogGet(new Request("http://localhost/api/integrations/catalog"))).status).toBe(200);
    expect((await listGet(new Request(`http://localhost/api/integration-credentials?workspaceId=${workspaceId}`))).status).toBe(200);
    expect((await createPost(request("http://localhost/api/integration-credentials", "POST", { workspaceId, connectorId: "slack", name: "Marketing", secret: { apiToken: "xoxb-secret" } }))).status).toBe(201);
    expect((await getRoute(request("http://localhost/api/integration-credentials/id", "GET"), context)).status).toBe(200);
    expect((await patchRoute(request("http://localhost/api/integration-credentials/id", "PATCH", { name: "Updated" }), context)).status).toBe(200);
    expect((await rotatePost(request("http://localhost/api/integration-credentials/id/rotate", "POST", { secret: { apiToken: "xoxb-new" } }), context)).status).toBe(200);
    expect((await deleteRoute(request("http://localhost/api/integration-credentials/id", "DELETE"), context)).status).toBe(204);
    expect(mocks.createIntegrationCredential).toHaveBeenCalledWith("user-1", expect.objectContaining({ workspaceId, connectorId: "slack" }));
    expect(mocks.rotateIntegrationCredential).toHaveBeenCalledWith("user-1", credentialId, { secret: { apiToken: "xoxb-new" } });
  });

  it("rejects client identity fields and never returns submitted or stored secrets", async () => {
    const invalid = await createPost(request("http://localhost/api/integration-credentials", "POST", { workspaceId, connectorId: "slack", name: "Marketing", secret: { apiToken: "xoxb-secret" }, userId: "user-2", ciphertext: "ciphertext" }));
    expect(invalid.status).toBe(400);
    expect(mocks.createIntegrationCredential).not.toHaveBeenCalled();
    const response = await createPost(request("http://localhost/api/integration-credentials", "POST", { workspaceId, connectorId: "slack", name: "Marketing", secret: { apiToken: "xoxb-secret" } }));
    expect(JSON.stringify(await response.json())).not.toContain("xoxb-secret");
    expect(JSON.stringify(await catalogGet(new Request("http://localhost/api/integrations/catalog")).then((value) => value.json()))).not.toContain("token");
  });

  it("maps unauthenticated and service errors through the existing error response", async () => {
    mocks.requireUser.mockRejectedValue(new AppError("UNAUTHENTICATED", 401, "Sign in is required."));
    expect((await listGet(new Request(`http://localhost/api/integration-credentials?workspaceId=${workspaceId}`))).status).toBe(401);
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.getIntegrationCredential.mockRejectedValue(new AppError("INTEGRATION_CREDENTIAL_NOT_FOUND", 404, "Integration credential not found."));
    expect((await getRoute(request("http://localhost/api/integration-credentials/id", "GET"), context)).status).toBe(404);
  });
});
