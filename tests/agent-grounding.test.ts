import { describe, expect, it } from "vitest";
import { buildGroundingContext, repairGroundedFinalResponse, validateGroundedFinalResponse } from "@/lib/agents/grounding";

const goal = "Create a factual marketing plan using only the saved brand information.";
const observations = [
  {
    toolName: "get_brand_profile",
    text: JSON.stringify({ name: "SweetBites Bakery", targetAudience: "Ordinary customers", tone: "warm" }),
  },
  {
    toolName: "search_brand_knowledge",
    text: JSON.stringify({ results: [
      { title: "Products", content: "Classic Chocolate Brownies. RM25 per box of 6 brownies." },
      { title: "Ordering", content: "Order through WhatsApp. Orders require at least 2 days in advance." },
      { title: "Promotions", content: "No active discount or promotion." },
    ] }),
  },
];

const context = buildGroundingContext({ goal, observations });

function check(finalText: string) {
  return validateGroundedFinalResponse(finalText, context);
}

describe("agent grounding contract", () => {
  it("preserves known price, quantity, ordering method, and notice period", () => {
    expect(check("Classic Chocolate Brownies are RM25 per box of 6 brownies. Order through WhatsApp at least 2 days in advance.")).toEqual({ ok: true });
  });

  it.each([
    ["50% discount", "discount"],
    ["a limited-time discount", "discount"],
    ["free delivery to your doorstep", "delivery"],
    ["a customer testimonial says these are the best brownies", "testimonial"],
    ["if no testimonial is available, create a hypothetical one", "testimonial"],
    ["if no testimonial is available, create a fictional one", "testimonial"],
    ["our brownies are loved by many", "testimonial"],
    ["hear from our happy customers who cannot get enough", "testimonial"],
    ["#SweetBitesTestimonial", "testimonial"],
    ["halal certified brownies", "certification"],
    ["Belgian chocolate brownies", "product"],
    ["serve the brownies with ice cream", "ingredient"],
    ["collaborate with an influencer in Kuala Lumpur", "location"],
  ] as const)("rejects unsupported %s", (finalText, category) => {
    const result = check(`Promote the brownies with ${finalText}.`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.category)).toContain(category);
  });

  it("allows generic strategy and explicitly conditional suggestions", () => {
    expect(check("Post consistently during the week.")).toEqual({ ok: true });
    expect(check("Consider offering a weekend promotion if you choose to create one.")).toEqual({ ok: true });
    expect(check("No active discount or promotion is saved.")).toEqual({ ok: true });
  });

  it("allows explicit facts in the current user goal", () => {
    const goalContext = buildGroundingContext({
      goal: "The owner confirmed the product costs RM25 per box of 6 brownies and orders use WhatsApp.",
      observations: [],
    });
    expect(validateGroundedFinalResponse("The confirmed price is RM25 per box of 6 brownies; order through WhatsApp.", goalContext)).toEqual({ ok: true });
  });

  it("does not treat an imperative unsupported request as a confirmed fact", () => {
    const requestContext = buildGroundingContext({ goal: "Create a 50% discount campaign for the brownies.", observations: [] });
    expect(validateGroundedFinalResponse("Offer 50% off the brownies.", requestContext).ok).toBe(false);
  });

  it("does not allow a fact from another workspace to satisfy validation", () => {
    const result = validateGroundedFinalResponse("The brownies are RM40 and halal certified.", context);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.category)).toEqual(expect.arrayContaining(["price", "certification"]));
  });

  it("rejects business facts when no authorized knowledge is available", () => {
    const emptyContext = buildGroundingContext({ goal: "Write a general marketing idea.", observations: [] });
    expect(validateGroundedFinalResponse("Our brownies are RM25 and delivered free.", emptyContext).ok).toBe(false);
  });

  it("repairs an unsafe draft by retaining only safe sentences and verified details", () => {
    const repaired = repairGroundedFinalResponse("Post consistently during the week. Enjoy 50% off with free delivery.", context);

    expect(repaired).toContain("Post consistently during the week.");
    expect(repaired).not.toContain("50%");
    expect(repaired).not.toContain("free delivery");
    expect(validateGroundedFinalResponse(repaired, context)).toEqual({ ok: true });
  });
});
