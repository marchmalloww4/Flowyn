import { describe, expect, it, vi } from "vitest";
import { executeStaticEgress, IntegrationEgressError } from "@/lib/integrations/egress";

const okResponse = (body = JSON.stringify({ ok: true }), headers: Record<string, string> = { "content-type": "application/json" }) => new Response(body, { status: 200, headers });

describe("bounded static integration egress", () => {
  it("maps the closed target to Slack POST and rejects redirects", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(okResponse());
    await executeStaticEgress({ target: "slack.chat.post_message", authorization: "xoxb-test", body: JSON.stringify({ channel: "C1", text: "Hi" }), enabled: true, fetcher });
    expect(fetcher).toHaveBeenCalledWith("https://slack.com/api/chat.postMessage", expect.objectContaining({ method: "POST", redirect: "error", headers: { Authorization: "Bearer xoxb-test", "Content-Type": "application/json" } }));
    await expect(executeStaticEgress({ target: "other.target" as never, authorization: "x", body: "{}", enabled: true })).rejects.toMatchObject({ code: "EGRESS_CONNECTION_FAILED" });
    expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty("url");
  });

  it("fails closed when egress is disabled and enforces response content and size bounds", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(okResponse());
    await expect(executeStaticEgress({ target: "slack.chat.post_message", authorization: "x", body: "{}", enabled: false, fetcher })).rejects.toMatchObject({ code: "EGRESS_DISABLED" });
    await expect(executeStaticEgress({ target: "slack.chat.post_message", authorization: "x", body: "x".repeat(20000), enabled: true, maxRequestBytes: 10, fetcher })).rejects.toMatchObject({ code: "EGRESS_REQUEST_TOO_LARGE" });
    fetcher.mockResolvedValueOnce(okResponse("not-json", { "content-type": "text/plain" }));
    await expect(executeStaticEgress({ target: "slack.chat.post_message", authorization: "x", body: "{}", enabled: true, fetcher })).rejects.toMatchObject({ code: "EGRESS_INVALID_RESPONSE" });
    fetcher.mockResolvedValueOnce(okResponse("x".repeat(200), { "content-type": "application/json" }));
    await expect(executeStaticEgress({ target: "slack.chat.post_message", authorization: "x", body: "{}", enabled: true, maxResponseBytes: 10, fetcher })).rejects.toMatchObject({ code: "EGRESS_RESPONSE_TOO_LARGE" });
  });

  it("classifies timeout and connection failures without exposing request material", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(Object.assign(new Error("socket xoxb-secret"), { name: "AbortError" }));
    await expect(executeStaticEgress({ target: "slack.chat.post_message", authorization: "xoxb-secret", body: "{}", enabled: true, fetcher })).rejects.toBeInstanceOf(IntegrationEgressError);
    try { await executeStaticEgress({ target: "slack.chat.post_message", authorization: "xoxb-secret", body: "{}", enabled: true, fetcher }); } catch (error) { expect(String(error)).not.toContain("xoxb-secret"); }
  });

  it("distinguishes cancellation before dispatch from cancellation during an in-flight request", async () => {
    const beforeDispatch = new AbortController();
    beforeDispatch.abort();
    await expect(executeStaticEgress({ target: "slack.chat.post_message", authorization: "x", body: "{}", enabled: true, signal: beforeDispatch.signal, fetcher: vi.fn() })).rejects.toMatchObject({ code: "EGRESS_CANCELLED" });

    const duringRequest = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      duringRequest.abort();
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (init?.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      return okResponse();
    });
    await expect(executeStaticEgress({ target: "slack.chat.post_message", authorization: "x", body: "{}", enabled: true, signal: duringRequest.signal, fetcher })).rejects.toMatchObject({ code: "EGRESS_CANCELLED_AFTER_DISPATCH" });
  });
});
