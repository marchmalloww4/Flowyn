import type { ZodType, ZodTypeDef } from "zod";
import type { LLMJsonSchema } from "@/lib/ai/types";
import { AppError } from "@/lib/security/errors";
import { getBrandProfileTool } from "@/lib/agents/tools/get-brand-profile";
import { searchBrandKnowledgeTool } from "@/lib/agents/tools/search-brand-knowledge";

export interface ToolExecutionContext {
  workspaceId: string;
  userId: string;
  agentId: string;
  runId: string;
  brandId?: string;
  abortSignal: AbortSignal;
}

export interface SafeToolObservation {
  metadata: Record<string, string | number | boolean | null>;
  durationMs: number;
  characterCount: number;
}

export interface ToolExecutionResult<TOutput> {
  modelObservation: TOutput;
  safeSummary: SafeToolObservation;
}

export interface AgentTool<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: ZodType<TInput, ZodTypeDef, unknown>;
  inputDescription: string;
  requiresBrand: boolean;
  inputJsonSchema?: LLMJsonSchema;
  execute(input: TInput, context: ToolExecutionContext): Promise<ToolExecutionResult<TOutput>>;
  serializeObservation(output: TOutput): string;
}

type RegisteredTool = AgentTool<unknown, unknown>;

export interface PublicAgentToolDefinition {
  name: string;
  description: string;
  inputDescription: string;
}

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  register<TInput, TOutput>(tool: AgentTool<TInput, TOutput>): void {
    if (this.tools.has(tool.name)) throw new AppError("AGENT_DUPLICATE_TOOL", 500, "The agent tool registry contains a duplicate tool.");
    this.tools.set(tool.name, tool as RegisteredTool);
  }

  get(name: string): RegisteredTool {
    const tool = this.tools.get(name);
    if (!tool) throw new AppError("AGENT_UNKNOWN_TOOL", 400, "The requested agent tool is not registered.");
    return tool;
  }

  getEffectiveTools(configuredNames: string[], context: Pick<ToolExecutionContext, "brandId">): RegisteredTool[] {
    const seen = new Set<string>();
    return configuredNames.flatMap((name) => {
      if (seen.has(name)) return [];
      seen.add(name);
      const tool = this.tools.get(name);
      if (!tool || (tool.requiresBrand && !context.brandId)) return [];
      return [tool];
    });
  }

  getPublicDefinitions(configuredNames: string[], context: Pick<ToolExecutionContext, "brandId">): PublicAgentToolDefinition[] {
    return this.getEffectiveTools(configuredNames, context).map((tool) => ({ name: tool.name, description: tool.description, inputDescription: tool.inputDescription }));
  }
}

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(searchBrandKnowledgeTool);
  registry.register(getBrandProfileTool);
  return registry;
}
