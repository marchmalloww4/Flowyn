export interface BrandPromptContext {
  name?: string | null;
  description?: string | null;
  industry?: string | null;
  targetAudience?: string | null;
  positioning?: string | null;
  valueProposition?: string | null;
  tone?: string | null;
  personality?: string | null;
  preferredVocabulary?: string[] | null;
  forbiddenVocabulary?: string[] | null;
  writingRules?: string[] | null;
  ctaPreferences?: string | null;
  formattingPreferences?: string | null;
  productInformation?: string | null;
}

export interface PromptBuildInput {
  systemInstructions?: string;
  userInstructions: string;
  context?: string;
  brandContext?: BrandPromptContext;
  outputRequirements?: string;
}

export interface BuiltPrompt {
  system: string;
  prompt: string;
  totalChars: number;
}

function clean(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function brandLines(context: BrandPromptContext): string[] {
  const fields: Array<[string, string | null | undefined]> = [
    ["Name", context.name],
    ["Description", context.description],
    ["Industry", context.industry],
    ["Target audience", context.targetAudience],
    ["Positioning", context.positioning],
    ["Value proposition", context.valueProposition],
    ["Tone", context.tone],
    ["Personality", context.personality],
    ["CTA preferences", context.ctaPreferences],
    ["Formatting preferences", context.formattingPreferences],
    ["Product information", context.productInformation],
  ];
  const lines = fields.flatMap(([label, value]) => {
    const normalized = clean(value);
    return normalized ? [`${label}: ${normalized}`] : [];
  });
  if (context.preferredVocabulary?.length) lines.push(`Preferred vocabulary: ${context.preferredVocabulary.join(", ")}`);
  if (context.forbiddenVocabulary?.length) lines.push(`Forbidden vocabulary: ${context.forbiddenVocabulary.join(", ")}`);
  if (context.writingRules?.length) lines.push(`Writing rules: ${context.writingRules.join("; ")}`);
  return lines;
}

export function buildPrompt(input: PromptBuildInput): BuiltPrompt {
  const system = clean(input.systemInstructions) ?? "";
  const sections = [`User instructions:\n${input.userInstructions.trim()}`];
  const outputRequirements = clean(input.outputRequirements);
  if (outputRequirements) sections.push(`Output requirements:\n${outputRequirements}`);
  const context = clean(input.context);
  if (context) sections.push(`Additional context:\n${context}`);
  if (input.brandContext) {
    const lines = brandLines(input.brandContext);
    if (lines.length) sections.push(`Brand context:\n${lines.join("\n")}`);
  }
  return { system, prompt: sections.join("\n\n"), totalChars: system.length + sections.join("\n\n").length };
}
