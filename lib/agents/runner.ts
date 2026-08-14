import { AIError } from "@/lib/ai/errors";
import { getAIProvider } from "@/lib/ai/service";
import type { LLMProvider } from "@/lib/ai/types";
import { agentDecisionSchema, type AgentDecision } from "@/lib/agents/decisions";
import { buildAgentPrompt } from "@/lib/agents/prompt";
import { createDefaultToolRegistry, type ToolRegistry } from "@/lib/agents/registry";
import { completeAgentRun, failAgentRun, recordAgentRunStep, startAgentRun, startAgentRunForPrincipal, type AgentRun, type AgentRunStepInput } from "@/lib/agents/service";
import { agentRunSchema } from "@/lib/agents/validation";
import { getDatabase, type Database } from "@/lib/database";
import { AppError } from "@/lib/security/errors";
import { userExecutionPrincipal, type ExecutionPrincipal } from "@/lib/security/principal";
import { agentDecisionOperationKey } from "@/lib/usage/policy";
import { admitAgentDecision } from "@/lib/usage/service";
import type { UsageOperationIdentity } from "@/lib/usage/types";

export interface RunAgentInput {
  userId?: string;
  principal?: ExecutionPrincipal;
  agentId: string;
  goal: string;
  provider?: LLMProvider;
  registry?: ToolRegistry;
  db?: Database;
  abortSignal?: AbortSignal;
  usage?: UsageOperationIdentity;
  idempotencyKey?: string;
  onRunCreated?: (run: AgentRun) => Promise<void>;
}

export interface AgentRunnerResult {
  runId: string;
  status: "COMPLETED" | "MAX_STEPS_REACHED";
  stepCount: number;
  finalResponse: string | null;
  errorCode: string | null;
}

type OperationKind = "model" | "tool";

export class AgentRunError extends AppError {
  constructor(code: string, status: number, message: string, public readonly runId: string) {
    super(code, status, message);
    this.name = "AgentRunError";
  }
}

function buildAgentDecisionJsonSchema(tools: Array<ReturnType<ToolRegistry["get"]>>): Record<string, unknown> {
  const toolBranches = tools.length > 0 ? tools.map((tool) => ({
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string", enum: [tool.name] },
      arguments: tool.inputJsonSchema ?? { type: "object" },
    },
    required: ["name", "arguments"],
  })) : [{ type: "object", additionalProperties: false, properties: { name: { type: "string" }, arguments: { type: "object" } }, required: ["name", "arguments"] }];
  return {
    type: "object",
    additionalProperties: false,
    oneOf: [
      { type: "object", additionalProperties: false, properties: { type: { type: "string", enum: ["final"] }, final: { type: "string", minLength: 1 } }, required: ["type", "final"] },
      { type: "object", additionalProperties: false, properties: { type: { type: "string", enum: ["tool"] }, tool: { oneOf: toolBranches } }, required: ["type", "tool"] },
    ],
  };
}

function createDatabaseFacade(db: Database): Database {
  return {
    select: db.select.bind(db),
    insert: db.insert.bind(db),
    update: db.update.bind(db),
    delete: db.delete.bind(db),
    transaction: db.transaction.bind(db),
  } as unknown as Database;
}

function agentError(code: string, status: number, message: string): AppError {
  return new AppError(code, status, message);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function runWithTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  parentSignal: AbortSignal,
  timeoutMs: number,
  totalTimeoutObserved: () => boolean,
): Promise<T> {
  if (parentSignal.aborted) {
    throw totalTimeoutObserved()
      ? agentError("AGENT_TIMEOUT", 504, "The agent exceeded its total execution timeout.")
      : agentError("AGENT_CANCELLED", 499, "The agent run was cancelled.");
  }
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      parentSignal.removeEventListener("abort", onAbort);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => {
      controller.abort();
      finish(() => reject(totalTimeoutObserved()
        ? agentError("AGENT_TIMEOUT", 504, "The agent exceeded its total execution timeout.")
        : agentError("AGENT_CANCELLED", 499, "The agent run was cancelled.")));
    };
    const timer = setTimeout(() => {
      controller.abort();
      finish(() => reject(agentError("AGENT_TIMEOUT", 504, "The agent step exceeded its execution timeout.")));
    }, timeoutMs);
    parentSignal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve()
      .then(() => operation(controller.signal))
      .then((value) => finish(() => resolve(value)))
      .catch((error: unknown) => finish(() => reject(error)));
  });
}

function safeErrorCode(error: unknown): string {
  return error instanceof AppError ? error.code : "AGENT_INTERNAL_ERROR";
}

function normalizeFailure(error: unknown, operation: OperationKind, totalTimeoutObserved: boolean, abortObserved: boolean): AppError {
  if (error instanceof AppError) return error;
  if (totalTimeoutObserved) {
    return agentError("AGENT_TIMEOUT", 504, "The agent execution timed out.");
  }
  if (abortObserved || isAbortError(error)) return agentError("AGENT_CANCELLED", 499, "The agent run was cancelled.");
  if (error instanceof AIError && error.code === "REQUEST_TIMEOUT") {
    return agentError("AGENT_TIMEOUT", 504, "The agent execution timed out.");
  }
  if (operation === "tool") return agentError("AGENT_TOOL_ERROR", 502, "The agent tool failed.");
  return agentError("AGENT_MODEL_ERROR", 502, "The agent model failed.");
}

function resultFromRun(run: AgentRun | undefined, fallbackRunId: string, status: AgentRunnerResult["status"], stepCount: number, finalResponse: string | null, errorCode: string | null): AgentRunnerResult {
  return { runId: run?.id ?? fallbackRunId, status, stepCount, finalResponse, errorCode };
}

async function recordStep(input: AgentRunStepInput, db: Database): Promise<void> {
  await recordAgentRunStep(input, db);
}

export async function runAgent(input: RunAgentInput): Promise<AgentRunnerResult> {
  const db = input.db ?? createDatabaseFacade(getDatabase());
  const parsedGoal = agentRunSchema.parse({ goal: input.goal });
  const principal = input.principal ?? (input.userId ? userExecutionPrincipal(input.userId) : undefined);
  if (!principal) throw new AppError("AGENT_PRINCIPAL_REQUIRED", 500, "Agent execution requires a verified execution principal.");
  const started = principal.kind === "workspace_automation"
    ? await startAgentRunForPrincipal(principal, input.agentId, parsedGoal.goal, db, input.usage)
    : await startAgentRun(principal.userId, input.agentId, parsedGoal.goal, db, input.usage, input.idempotencyKey);
  if (started.idempotent) {
    if (started.run.status === "COMPLETED") return resultFromRun(started.run, started.run.id, "COMPLETED", started.run.stepCount, started.run.finalResponse, null);
    if (started.run.status === "MAX_STEPS_REACHED") return resultFromRun(started.run, started.run.id, "MAX_STEPS_REACHED", started.run.stepCount, started.run.finalResponse, started.run.errorCode);
    throw new AgentRunError("AGENT_RUN_ALREADY_EXISTS", 409, "An agent run already exists for this Idempotency-Key.", started.run.id);
  }
  try {
    await input.onRunCreated?.(started.run);
  } catch (error) {
    await started.releaseReservation?.();
    throw error;
  }
  const provider = input.provider ?? getAIProvider();
  const registry = input.registry ?? createDefaultToolRegistry();
  const rootController = new AbortController();
  let totalTimeoutObserved = false;
  let stepCount = 0;
  let operation: OperationKind = "model";
  const externalAbort = () => rootController.abort();
  const totalTimer = setTimeout(() => {
    totalTimeoutObserved = true;
    rootController.abort();
  }, started.policy.totalTimeoutMs);
  if (input.abortSignal?.aborted) rootController.abort();
  else input.abortSignal?.addEventListener("abort", externalAbort, { once: true });

  try {
    const effectiveTools = registry.getEffectiveTools(started.agent.allowedTools, { brandId: started.agent.brandId ?? undefined });
    const publicTools = registry.getPublicDefinitions(started.agent.allowedTools, { brandId: started.agent.brandId ?? undefined });
    const observations: Array<{ toolName: string; text: string }> = [];
    const admittedDecisionKeys = new Set<string>();

    for (stepCount = 1; stepCount <= started.policy.maxSteps; stepCount += 1) {
      let decision: AgentDecision | undefined;
      let selectedTool: ReturnType<ToolRegistry["get"]> | undefined;
      let parsedToolInput: unknown;
      let correctionFeedback: string | undefined;
      for (let attempt = 0; attempt < 3 && !decision; attempt += 1) {
        const built = buildAgentPrompt({
          agent: started.agent,
          goal: parsedGoal.goal,
          tools: publicTools,
          observations,
          policy: { maxSteps: started.policy.maxSteps, maxObservationChars: started.policy.maxObservationChars },
        });
        operation = "model";
        if (input.usage) {
          const operationKey = agentDecisionOperationKey(started.run.id, stepCount);
          if (!admittedDecisionKeys.has(operationKey)) {
            await admitAgentDecision({ workspaceId: started.run.workspaceId, operationKey, sourceType: "AGENT_DECISION", sourceId: started.run.id, correlationId: input.usage.correlationId, db });
            admittedDecisionKeys.add(operationKey);
          }
        }
        const modelResult = await runWithTimeout(
          (signal) => provider.generateStructured({ prompt: built.prompt, system: correctionFeedback ? `${built.system}\nServer validation feedback: ${correctionFeedback}` : built.system, schema: agentDecisionSchema, format: buildAgentDecisionJsonSchema(effectiveTools), temperature: 0, maxTokens: 400, signal }),
          rootController.signal,
          started.policy.modelTimeoutMs,
          () => totalTimeoutObserved,
        );
        const decisionResult = agentDecisionSchema.safeParse(modelResult.value);
        if (!decisionResult.success) {
          if (attempt < 2) {
            correctionFeedback = "The previous response failed the server decision schema. Return exactly one valid tool or final JSON object.";
            continue;
          }
          throw agentError("AGENT_INVALID_DECISION", 502, "The agent model returned an invalid decision.");
        }
        const candidate = decisionResult.data;
        if (candidate.type === "final") {
          decision = candidate;
          break;
        }
        const tool = registry.get(candidate.tool.name);
        if (!effectiveTools.some((effectiveTool) => effectiveTool.name === tool.name)) {
          throw agentError("AGENT_TOOL_NOT_ALLOWED", 400, "The requested agent tool is not allowed for this run.");
        }
        const parsedInput = tool.inputSchema.safeParse(candidate.tool.arguments);
        if (!parsedInput.success) {
          if (attempt < 2) {
            correctionFeedback = `The ${tool.name} arguments failed server validation. Return a complete JSON tool call now. Do not use {}. Include every required field exactly as described; for search_brand_knowledge use {"query":"the user's question","topK":5}.`;
            continue;
          }
          throw agentError("AGENT_INVALID_TOOL_INPUT", 400, "The agent tool arguments are invalid.");
        }
        decision = candidate;
        selectedTool = tool;
        parsedToolInput = parsedInput.data;
      }
      if (!decision) throw agentError("AGENT_INVALID_DECISION", 502, "The agent model did not return a usable decision.");
      await recordStep({
        workspaceId: started.run.workspaceId,
        runId: started.run.id,
        stepNumber: stepCount,
        type: "MODEL_DECISION",
        status: "SUCCEEDED",
        safeOutputMetadata: decision.type === "final"
          ? { decisionType: "final", finalResponseChars: Math.min(decision.final.length, started.policy.maxFinalResponseChars) }
          : { decisionType: "tool", toolName: decision.tool.name },
      }, db);

      if (decision.type === "final") {
        const finalResponse = decision.final.slice(0, started.policy.maxFinalResponseChars);
        await recordStep({
          workspaceId: started.run.workspaceId,
          runId: started.run.id,
          stepNumber: stepCount,
          type: "FINAL_RESPONSE",
          status: "SUCCEEDED",
          safeOutputMetadata: { finalResponseChars: finalResponse.length },
        }, db);
        const run = await completeAgentRun(started.run.id, { status: "COMPLETED", stepCount, finalResponse }, db);
        return resultFromRun(run, started.run.id, "COMPLETED", stepCount, finalResponse, null);
      }

      if (!selectedTool || parsedToolInput === undefined) throw agentError("AGENT_INVALID_TOOL_INPUT", 400, "The agent tool arguments are invalid.");
      const tool = selectedTool;
      const argumentKeys = Object.keys(decision.tool.arguments).sort();
      await recordStep({
        workspaceId: started.run.workspaceId,
        runId: started.run.id,
        stepNumber: stepCount,
        type: "TOOL_CALL",
        toolName: tool.name,
        status: "SUCCEEDED",
        safeInputMetadata: { argumentCount: argumentKeys.length, argumentKeys: argumentKeys.join(",") },
      }, db);
      operation = "tool";
      const toolResult = await runWithTimeout(
        (signal) => tool.execute(parsedToolInput, {
          workspaceId: started.agent.workspaceId,
          userId: principal.kind === "user" ? principal.userId : null,
          principal,
          agentId: started.agent.id,
          runId: started.run.id,
          ...(started.agent.brandId ? { brandId: started.agent.brandId } : {}),
          abortSignal: signal,
        }),
        rootController.signal,
        started.policy.toolTimeoutMs,
        () => totalTimeoutObserved,
      );
      const serializedObservation = tool.serializeObservation(toolResult.modelObservation);
      observations.push({ toolName: tool.name, text: serializedObservation });
      await recordStep({
        workspaceId: started.run.workspaceId,
        runId: started.run.id,
        stepNumber: stepCount,
        type: "TOOL_RESULT",
        toolName: tool.name,
        status: "SUCCEEDED",
        safeOutputMetadata: { ...toolResult.safeSummary.metadata, durationMs: toolResult.safeSummary.durationMs, characterCount: toolResult.safeSummary.characterCount },
      }, db);
    }

    const errorCode = "AGENT_MAX_STEPS";
    const run = await failAgentRun(started.run.id, { status: "MAX_STEPS_REACHED", stepCount: started.policy.maxSteps, errorCode }, db);
    return resultFromRun(run, started.run.id, "MAX_STEPS_REACHED", started.policy.maxSteps, null, errorCode);
  } catch (error) {
    const normalized = normalizeFailure(error, operation, totalTimeoutObserved, rootController.signal.aborted);
    const status = normalized.code === "AGENT_CANCELLED" ? "CANCELLED" : "FAILED";
    try {
      await recordStep({
        workspaceId: started.run.workspaceId,
        runId: started.run.id,
        stepNumber: Math.max(1, stepCount),
        type: "ERROR",
        status: status === "CANCELLED" ? "CANCELLED" : "FAILED",
        errorCode: normalized.code,
        safeOutputMetadata: { errorCode: normalized.code },
      }, db);
      await failAgentRun(started.run.id, { status, stepCount: Math.min(stepCount, started.policy.maxSteps), errorCode: normalized.code }, db);
    } catch (persistenceError) {
      console.error("Agent run failure persistence failed", safeErrorCode(persistenceError));
    }
    throw new AgentRunError(normalized.code, normalized.status, normalized.message, started.run.id);
  } finally {
    clearTimeout(totalTimer);
    input.abortSignal?.removeEventListener("abort", externalAbort);
    try {
      await started.releaseReservation?.();
    } catch (releaseError) {
      console.error("Agent reservation release failed", safeErrorCode(releaseError));
    }
  }
}
