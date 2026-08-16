export type GroundingIssueCategory =
  | "price"
  | "quantity"
  | "ordering_method"
  | "discount"
  | "delivery"
  | "testimonial"
  | "certification"
  | "product"
  | "ingredient"
  | "contact"
  | "opening_hours"
  | "guarantee"
  | "location";

export interface AgentGroundingObservation {
  toolName: string;
  text: string;
}

export interface AgentGroundingContext {
  goal: string;
  trustedSources: string[];
  normalizedTrustedText: string;
}

export interface GroundingIssue {
  category: GroundingIssueCategory;
}

export type GroundingValidationResult =
  | { ok: true }
  | { ok: false; issues: GroundingIssue[] };

/** Safe message for the narrow AGENT_UNGROUNDED_OUTPUT failure path. */
export const AGENT_UNGROUNDED_OUTPUT_MESSAGE = "The agent generated business claims that could not be verified from your saved brand information. Review or add the missing facts and run again.";

const moneyPattern = /(?:\b(?:rm|myr|usd|eur|gbp)\s*\d+(?:[.,]\d{1,2})?|[$€£]\s*\d+(?:[.,]\d{1,2})?|\b\d+(?:[.,]\d{1,2})?\s*(?:rm|myr|usd|eur|gbp)\b)/giu;
const percentagePattern = /\b\d+(?:[.,]\d+)?\s*%/gu;
const quantityPattern = /\b\d+\s+(?:brownies?|boxes?|box)\b/giu;
const noticePattern = /\b\d+\s+days?\s+(?:in advance|ahead|notice|before)\b/giu;
const contactEmailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const contactPhonePattern = /\b(?:phone|telephone|tel|call|text|contact)\D{0,20}(\+?\d[\d\s().-]{6,}\d)\b/giu;

const rules: Array<{ category: GroundingIssueCategory; pattern: RegExp }> = [
  { category: "discount", pattern: /\b(?:discount|promotion|promo|sale|special offer|limited[- ]time offer|deal)\b/iu },
  { category: "delivery", pattern: /\b(?:free\s+delivery|delivery\s+(?:available|included|to|within|across|areas?)|deliver(?:ed|y)?\s+(?:right\s+)?to\s+(?:your\s+)?doorstep|same[- ]day\s+delivery)\b/iu },
  { category: "testimonial", pattern: /(?:#\w*testimonial\b|\b(?:customer\s+testimonial|testimonial\s*[:\-]|(?:a|one|our)\s+customer\s+(?:said|says|loved|raved|called)|(?:our|these|the)\s+(?:brownies?|products?)\s+(?:are|were)\s+(?:loved|popular|best|famous|enjoyed)\s+by|(?:our|these|the)\s+(?:famous|best|popular)\s+(?:brownies?|products?)|(?:happy|satisfied|many)\s+customers?\b|customers?\s+(?:love|loved|enjoy|enjoyed|can.t\s+get\s+enough)))\b/iu },
  { category: "certification", pattern: /\b(?:halal|kosher|organic|certified|certification)\b/iu },
  { category: "product", pattern: /\b(?:belgian\s+chocolate|(?:new|other|additional|extra)\s+(?:flavou?rs?|products?|items?)|(?:vanilla|red velvet|salted caramel|white chocolate)\s+(?:brownies?|cookies?|cakes?|cupcakes?))\b/iu },
  { category: "ingredient", pattern: /\b(?:contains?|ingredients?\s*:|made\s+with\s+(?:real|premium|organic|belgian|dark|milk|white)\s+\w+|(?:with|topped\s+with|served\s+with)\s+(?:ice\s+cream|whipped\s+cream|nuts?|sprinkles?))\b/iu },
  { category: "opening_hours", pattern: /\b(?:opening\s+hours?|business\s+hours?|open\s+(?:daily|from|on))\b/iu },
  { category: "guarantee", pattern: /\bguarantee(?:d)?\b/iu },
  { category: "location", pattern: /\b(?:kuala\s+lumpur|malaysia|selangor|penang|johor|singapore|london|new\s+york)\b/iu },
];

function normalizeText(value: string): string {
  return value.toLocaleLowerCase().replace(/[“”„]/gu, '"').replace(/[’‘]/gu, "'").replace(/\s+/gu, " ").trim();
}

function compact(value: string): string {
  return normalizeText(value).replace(/[\s.,]/gu, "");
}

function trustedContains(context: AgentGroundingContext, value: string): boolean {
  return context.normalizedTrustedText.includes(normalizeText(value));
}

function trustedContainsCompact(context: AgentGroundingContext, value: string): boolean {
  return compact(context.normalizedTrustedText).includes(compact(value));
}

function sentenceParts(value: string): string[] {
  return value
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function firstMatch(value: string, pattern: RegExp): string | null {
  const match = value.match(pattern);
  return match?.[0]?.trim() || null;
}

function buildVerifiedDetails(context: AgentGroundingContext): string[] {
  const sourceText = context.trustedSources.join("\n");
  const details: string[] = [];
  const product = firstMatch(sourceText, /\b(?:[A-Z][A-Za-z0-9-]*\s+){1,4}Brownies\b/u);
  const price = firstMatch(sourceText, /(?:\b(?:RM|MYR|USD|EUR|GBP)\s*\d+(?:[.,]\d{1,2})?|[$€£]\s*\d+(?:[.,]\d{1,2})?)/u);
  const quantity = firstMatch(sourceText, /\b\d+\s+(?:brownies?|boxes?|box)\b/iu);
  const orderingMatch = sourceText.match(/\b(?:order|orders|ordering)\s+(?:through|via|on|using|use)\s+([A-Za-z][A-Za-z0-9+._-]*)\b/iu);
  const notice = firstMatch(sourceText, /\b\d+\s+days?\s+(?:in advance|ahead|notice)\b/iu);

  if (product) details.push(product);
  if (price) details.push(price);
  if (quantity) details.push(quantity);
  if (orderingMatch?.[1]) details.push(`order through ${orderingMatch[1]}`);
  if (notice) details.push(notice);
  return [...new Set(details)];
}

function safeGroundingFallback(context: AgentGroundingContext): string {
  const details = buildVerifiedDetails(context);
  const verified = details.length > 0 ? ` Saved details: ${details.join("; ")}.` : "";
  return `I can provide a general marketing draft. Post consistently during the week, share product-focused content, and keep any business-specific detail as a suggestion for owner confirmation.${verified}`;
}

function isConditionallyFramed(sentence: string): boolean {
  return /\b(?:if|when|once|should\s+you|only\s+if|after\s+you\s+confirm|requires?\s+(?:owner\s+)?confirmation|if\s+you\s+(?:choose|decide)|if\s+available|if\s+any)\b/iu.test(sentence);
}

function isNegativeKnownStatement(sentence: string, context: AgentGroundingContext): boolean {
  if (!/\b(?:no|not|without|unknown|unavailable|needs?\s+confirmation)\b/iu.test(sentence)) return false;
  return trustedContains(context, sentence) || /\bno\s+active\s+(?:discount|promotion)\b/iu.test(sentence) && trustedContains(context, "No active discount or promotion");
}

function uniqueIssues(issues: GroundingIssue[]): GroundingIssue[] {
  return [...new Map(issues.map((issue) => [issue.category, issue])).values()];
}

function addIfUnsupported(issues: GroundingIssue[], category: GroundingIssueCategory, sentence: string, evidence: string, context: AgentGroundingContext): void {
  const savedNegativePromotion = category === "discount" && /\bno\s+active\s+(?:discount|promotion)\b/iu.test(context.normalizedTrustedText);
  if (savedNegativePromotion && !isNegativeKnownStatement(sentence, context) && !isConditionallyFramed(sentence)) {
    issues.push({ category });
    return;
  }
  if (trustedContains(context, evidence) || trustedContains(context, sentence) || isConditionallyFramed(sentence) || isNegativeKnownStatement(sentence, context)) return;
  issues.push({ category });
}

export function buildGroundingContext(input: { goal: string; observations: AgentGroundingObservation[] }): AgentGroundingContext {
  const goalFacts = sentenceParts(input.goal).filter((sentence) => {
    if (/^\s*(?:create|write|draft|generate|include|use|do not|don't|help|promote|make|offer|share|plan|tell|answer|give|provide)\b/iu.test(sentence)) return false;
    return /\b(?:confirmed|verified|saved|provided|costs?|priced?|orders?\s+(?:through|via|using)|order(?:s)?\s+through|has\s+(?:an|no)|requires?)\b/iu.test(sentence);
  });
  const trustedSources = [...goalFacts, ...input.observations.map((observation) => observation.text)].filter((source) => source.trim().length > 0);
  return {
    goal: input.goal,
    trustedSources,
    normalizedTrustedText: normalizeText(trustedSources.join("\n")),
  };
}

export function validateGroundedFinalResponse(finalText: string, context: AgentGroundingContext): GroundingValidationResult {
  const issues: GroundingIssue[] = [];

  for (const sentence of sentenceParts(finalText)) {
    if (/\b(?:hypothetical|fictional|fabricate|make\s+up|pretend)\b/iu.test(sentence)) issues.push({ category: "testimonial" });
    for (const match of sentence.matchAll(moneyPattern)) {
      const evidence = match[0] ?? "";
      if (!trustedContainsCompact(context, evidence)) issues.push({ category: "price" });
    }
    for (const match of sentence.matchAll(percentagePattern)) {
      const evidence = match[0] ?? "";
      if (!trustedContainsCompact(context, evidence)) issues.push({ category: "discount" });
    }
    for (const match of sentence.matchAll(quantityPattern)) {
      const evidence = match[0] ?? "";
      if (!trustedContains(context, evidence)) issues.push({ category: "quantity" });
    }
    for (const match of sentence.matchAll(noticePattern)) {
      const evidence = match[0] ?? "";
      if (!trustedContains(context, evidence)) issues.push({ category: "quantity" });
    }
    for (const match of sentence.matchAll(contactEmailPattern)) {
      const evidence = match[0] ?? "";
      if (!trustedContains(context, evidence)) issues.push({ category: "contact" });
    }
    for (const match of sentence.matchAll(contactPhonePattern)) {
      const evidence = match[1] ?? match[0] ?? "";
      if (evidence.replace(/\D/gu, "").length >= 7 && !trustedContainsCompact(context, evidence)) issues.push({ category: "contact" });
    }

    for (const rule of rules) {
      const match = sentence.match(rule.pattern);
      if (!match) continue;
      addIfUnsupported(issues, rule.category, sentence, match[0], context);
    }

    const orderingMethod = sentence.match(/\b(?:order|contact)\s+(?:via|through|on)\s+([a-z][a-z0-9+.-]*)\b/iu);
    if (orderingMethod && !trustedContains(context, orderingMethod[1] ?? "")) addIfUnsupported(issues, "ordering_method", sentence, orderingMethod[0], context);
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues: uniqueIssues(issues) };
}

export function repairGroundedFinalResponse(finalText: string, context: AgentGroundingContext): string {
  const safeSentences = sentenceParts(finalText).filter((sentence) => validateGroundedFinalResponse(sentence, context).ok);
  const filtered = safeSentences.join("\n").trim();
  const details = buildVerifiedDetails(context);
  const repaired = filtered
    ? `${filtered}${details.length > 0 ? `\n\nVerified saved details: ${details.join("; ")}.` : ""}`
    : safeGroundingFallback(context);
  return validateGroundedFinalResponse(repaired, context).ok ? repaired : safeGroundingFallback(context);
}
