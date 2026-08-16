import { describe, expect, it } from "vitest";
import { agentRunHistoryPath, parseAgentRunResponse, toAgentPlainText } from "@/lib/client/agents-state";
import { FlowynClientError, mapApiError } from "@/lib/client/api";

const runId = "44444444-4444-4444-8444-444444444444";

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("browser Agent run response contract", () => {
  it("extracts the persisted run UUID and builds its history URL", () => {
    const parsed = parseAgentRunResponse({
      run: { runId, status: "COMPLETED", stepCount: 1, finalResponse: "Done.", errorCode: null },
    });

    expect(parsed.run.runId).toBe(runId);
    expect(agentRunHistoryPath(parsed.run.runId)).toBe(`/api/agent-runs/${runId}`);
    expect(agentRunHistoryPath(parsed.run.runId)).not.toContain("undefined");
  });

  it("keeps the real run UUID available when a durable run fails", () => {
    const body = { error: { code: "AGENT_TIMEOUT", message: "The agent execution timed out." }, runId };
    const error = mapApiError(response(504, body), body);

    expect(error.runId).toBe(runId);
    expect(agentRunHistoryPath(error.runId)).toBe(`/api/agent-runs/${runId}`);
  });

  it("fails safely before building a history request for malformed or missing identifiers", () => {
    expect(() => parseAgentRunResponse({ run: { status: "COMPLETED" } })).toThrow(FlowynClientError);
    expect(() => agentRunHistoryPath(undefined)).toThrow(FlowynClientError);
    expect(() => agentRunHistoryPath("undefined")).toThrow(FlowynClientError);
    expect(() => agentRunHistoryPath(null)).toThrow(FlowynClientError);
  });

  it("renders agent results as plain text without exposing literal HTML tags", () => {
    expect(toAgentPlainText("<p>Classic Chocolate Brownies cost RM25.</p>")).toBe("Classic Chocolate Brownies cost RM25.");
    expect(toAgentPlainText("<p>Day 1</p><p>Post consistently.</p>")).toBe("Day 1\nPost consistently.");
  });
});
