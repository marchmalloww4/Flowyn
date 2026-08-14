import { generationLogs, getDatabase, type Database } from "@/lib/database";

export type GenerationStatus = "SUCCEEDED" | "FAILED";

export interface GenerationLogInput {
  workspaceId: string;
  userId: string | null;
  provider: string;
  model: string;
  status: GenerationStatus;
  durationMs: number;
  inputChars: number;
  outputChars?: number;
  errorCode?: string;
}

export async function recordGenerationLog(input: GenerationLogInput, db: Database = getDatabase()): Promise<void> {
  await db.insert(generationLogs).values({
    workspaceId: input.workspaceId,
    userId: input.userId,
    provider: input.provider,
    model: input.model,
    status: input.status,
    durationMs: input.durationMs,
    inputChars: input.inputChars,
    outputChars: input.outputChars,
    errorCode: input.errorCode,
  });
}
