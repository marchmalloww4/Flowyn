import { afterEach, describe, expect, it } from "vitest";
import { getAIConfig } from "@/lib/ai/config";
import { resetEnvForTests } from "@/lib/env";

const originalEnv = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  AI_TEMPERATURE: process.env.AI_TEMPERATURE,
  AI_MAX_OUTPUT_TOKENS: process.env.AI_MAX_OUTPUT_TOKENS,
  OLLAMA_MODEL: process.env.OLLAMA_MODEL,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetEnvForTests();
});

describe("AI configuration", () => {
  it("reads trusted provider settings and preserves safe defaults", () => {
    delete process.env.AI_PROVIDER;
    delete process.env.AI_TEMPERATURE;
    delete process.env.AI_MAX_OUTPUT_TOKENS;
    delete process.env.OLLAMA_MODEL;
    resetEnvForTests();

    expect(getAIConfig()).toMatchObject({
      provider: "ollama",
      model: "llama3.2:3b",
      temperature: 0.4,
      maxOutputTokens: 800,
      timeoutMs: 60000,
      maxPromptChars: 12000,
    });
  });

  it("normalizes explicitly configured numeric settings", () => {
    process.env.AI_PROVIDER = "ollama";
    process.env.AI_TEMPERATURE = "0.7";
    process.env.AI_MAX_OUTPUT_TOKENS = "256";
    process.env.OLLAMA_MODEL = "llama3.2:3b";
    resetEnvForTests();

    expect(getAIConfig()).toMatchObject({ provider: "ollama", temperature: 0.7, maxOutputTokens: 256, model: "llama3.2:3b" });
  });
});
