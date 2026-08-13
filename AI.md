# Local AI

## Provider abstraction

Application code depends on:

```ts
interface LLMProvider {
  generate(input: LLMGenerateInput): Promise<LLMResult>;
  health(): Promise<LLMHealthResult>;
}
```

`OllamaProvider` is the default implementation. It calls Ollama’s local `/api/tags` and `/api/generate` endpoints and never calls a paid service.

## Configure Ollama

Set the model in `.env.local`:

```text
OLLAMA_MODEL=llama3.2:3b
```

Pull the exact tag:

```powershell
docker compose exec ollama ollama pull llama3.2:3b
```

A model health check is not a model download. Until the exact tag exists, the health endpoint reports `MODEL_MISSING` and generation returns a setup error.

## Generation flow

```text
Authenticated request
  -> Zod prompt validation
  -> configured LLMProvider
  -> Ollama /api/generate (stream=false)
  -> structured result
  -> dashboard output
```

Prompt size and output token limits are bounded by environment-backed settings. Provider failures are mapped to safe codes such as `UNAVAILABLE`, `TIMEOUT`, and `MODEL_MISSING`.

## Adding a provider later

1. Implement `LLMProvider` in a new provider module.
2. Keep provider-specific credentials in server-only environment configuration.
3. Map provider errors into `AIProviderError` without returning secrets or URLs.
4. Select the provider in `lib/ai/service.ts` using explicit configuration.
5. Add contract tests for generation, health, timeout, and model/configuration failures.

The agent and workflow milestones will consume this interface, not Ollama directly.

## Milestone 1 limitations

There is no agent loop, tool selection, RAG context retrieval, streaming UI, memory, critic, or workflow node execution in this milestone. The generation panel exists to verify the real local provider boundary before those systems are introduced.